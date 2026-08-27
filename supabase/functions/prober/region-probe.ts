// Multi-region probing (PRD §5.2, Phase 9, issue #60): fans a batch tick's
// due-project checks out to multiple configured AWS regions so a network
// partition between one region and a monitored host doesn't get
// misreported as "the project is down" -- only a majority of regions
// agreeing it's down escalates to an incident (see deriveConsensusStatus).
//
// Mechanism: Supabase's Edge Runtime honors an `x-region` request header,
// forcing a specific invocation to execute in that AWS region regardless
// of where the caller itself is
// (https://supabase.com/docs/guides/functions/regional-invocation) --
// there is no separate "deploy this same function to N regions" step; one
// deployment already runs everywhere, and `x-region` just pins a given
// call to one of them. `index.ts`'s orchestrator (still the single
// pg_cron-triggered, prober_lock-guarded batch tick, unchanged) uses this
// to recursively call *itself* once per configured region, each call
// carrying the *entire* due-project batch (not one call per project) --
// keeping the added Edge Function invocation cost O(regions), not
// O(regions x due projects), which matters a lot against the free tier's
// 500,000 invocations/month budget (see the schedule_prober_cron
// migration's own quota math) once a real project portfolio has more than
// a handful of due projects per tick. Each region's own probe uses the
// exact same `runHealthChecksWithRetry` batching/concurrency the
// single-region path already relies on.
//
// `checks.region` (Phase 1 schema) is finally populated by the N raw
// per-region rows this produces; the one additional "consensus" row each
// round also writes (index.ts, using deriveConsensusStatus below) is what
// incidents.ts's escalation/resolution streak actually reads -- see the
// add_multi_region_probing migration for why the raw per-region rows must
// stay out of that streak.
import type { CheckResult, DueProject } from "./check.ts";
import type { CheckStatus } from "./classify.ts";
import { readEnv } from "./env.ts";
import { runHealthChecksWithRetry } from "./retry.ts";

/** Three regions, spread across three continents for genuine network-path
 * diversity, and deliberately an odd number -- a majority vote (see
 * deriveConsensusStatus) can never tie. A fixed exported constant, not a
 * per-project or env-configurable setting -- same "boring, extensible v1"
 * precedent as classify.ts's WAKING_THRESHOLD_MS/incidents.ts's
 * ESCALATION_THRESHOLD: easy to change here and redeploy if it ever
 * matters, not worth a config surface until it does. Values are AWS
 * region codes from Supabase's documented supported-regions list. */
export const PROBE_REGIONS = ["us-east-1", "eu-west-2", "ap-southeast-1"] as const;

export type RegionBatchResult = {
  /** The *actual* execution region the sub-invocation reported for
   * itself (`Deno.env.get("SB_REGION")`), not merely an echo of the
   * `x-region` header we requested -- ground truth, per #60's own
   * acceptance criterion that `checks.region` holds "a real region
   * identifier". */
  region: string;
  results: CheckResult[];
  /** True only when the recursive self-invocation to this region itself
   * failed (network error, non-2xx, malformed response) -- an
   * infrastructure failure calling out to that region, distinct from
   * "that region successfully checked the project and found it down".
   * `results` is still populated in this case (one synthetic all-failing
   * CheckResult per project, see fanOutToRegions), but deriveConsensusStatus
   * must not count it as a legitimate down vote -- see that function's own
   * comment. */
  probeFailed: boolean;
};

/** Reads the `{ region_probe: { projects: [...] } }` request shape
 * (index.ts's third request shape, alongside the batch tick `{}` and
 * manual-check `{ project_id }`) out of an already-parsed request body.
 * Pure and exported for direct unit testing -- mirrors index.ts's own
 * (unexported, untested) readManualProjectId in spirit. Returns `null` for
 * anything that doesn't match, same "absence just means try the next
 * request shape" convention. */
export function parseRegionProbeProjects(body: unknown): DueProject[] | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const probe = (body as Record<string, unknown>).region_probe;
  if (!probe || typeof probe !== "object") {
    return null;
  }
  const projects = (probe as Record<string, unknown>).projects;
  return Array.isArray(projects) ? (projects as DueProject[]) : null;
}

/**
 * Sub-invocation-side handler (index.ts routes a parsed `region_probe`
 * request straight here): runs the exact same retry-aware check pipeline
 * as the single-region path, for the whole due-project batch the
 * orchestrator handed it directly -- no `get_due_projects()` call here,
 * since the requesting orchestrator already resolved that list once for
 * the whole tick and would otherwise pay for (and risk a slightly
 * different due-set from) a second, redundant query per region.
 * Deliberately does not classify/persist/touch incidents -- that all
 * happens back in the orchestrator once every region's raw results are in
 * hand (see index.ts).
 */
export async function runRegionProbe(
  projects: DueProject[],
): Promise<{ region: string; results: CheckResult[] }> {
  const region = readEnv("SB_REGION") ?? "unknown";
  const results = await runHealthChecksWithRetry(projects);
  return { region, results };
}

export type FanOutOptions = {
  /** This function's own public invocation URL
   * (`${SUPABASE_URL}/functions/v1/prober`) -- passed in rather than read
   * from `Deno.env` here so this stays a pure, injectable-dependency
   * function testable without real env vars (see region-probe.test.ts). */
  proberUrl: string;
  /** A valid `secret` mode API key (see index.ts) for the recursive
   * self-invocation to authenticate as -- same auth wall every other
   * caller of this function (pg_cron, the "run check now" Server Action)
   * already goes through. */
  secretKey: string;
  regions?: readonly string[];
  /** Injectable for tests (region-probe.test.ts) -- defaults to the real
   * global `fetch`. */
  fetchImpl?: typeof fetch;
};

/**
 * Orchestrator-side fan-out (#60): fires exactly one recursive
 * self-invocation per configured region, each carrying the entire
 * due-project batch (see this module's own top comment for the
 * O(regions)-not-O(regions x projects) invocation-cost reasoning).
 *
 * Never throws: a region whose recursive call itself fails (network
 * error, non-2xx, malformed JSON body) contributes a `probeFailed: true`
 * batch with one synthetic failing CheckResult per project instead of
 * aborting the whole tick -- by design indistinguishable, from the
 * monitored project's own perspective, from "that region genuinely
 * couldn't reach anything right now", which is exactly the kind of
 * regional failure #60 exists to tolerate via the other regions' votes.
 * `deriveConsensusStatus` below is what keeps a `probeFailed` batch from
 * being wrongly counted as a legitimate "down" vote for the monitored
 * project itself.
 */
export async function fanOutToRegions(
  projects: DueProject[],
  options: FanOutOptions,
): Promise<RegionBatchResult[]> {
  const regions = options.regions ?? PROBE_REGIONS;
  const doFetch = options.fetchImpl ?? fetch;

  return Promise.all(
    regions.map(async (region): Promise<RegionBatchResult> => {
      try {
        const response = await doFetch(options.proberUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: options.secretKey,
            "x-region": region,
          },
          body: JSON.stringify({ region_probe: { projects } }),
        });

        if (!response.ok) {
          throw new Error(`region probe to "${region}" responded with HTTP ${response.status}`);
        }

        const body = (await response.json()) as { region?: unknown; results?: unknown };
        if (typeof body.region !== "string" || !Array.isArray(body.results)) {
          throw new Error(`region probe to "${region}" returned a malformed response body`);
        }

        // Ground truth is whatever SB_REGION the sub-invocation itself
        // reported (runRegionProbe above), not the region we requested --
        // they should always match under normal operation, but the
        // response side is never overridden by the request side.
        return { region: body.region, results: body.results as CheckResult[], probeFailed: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          region,
          probeFailed: true,
          results: projects.map((project) => ({
            project_id: project.id,
            http_status: null,
            response_time_ms: 0,
            response_snippet: null,
            error_message: `Region probe failed: ${message}`,
            timed_out: false,
            attempts: 0,
          })),
        };
      }
    }),
  );
}

export type RegionVote = {
  region: string;
  status: CheckStatus;
  result: CheckResult;
  probeFailed: boolean;
};

export type ConsensusOutcome = {
  status: CheckStatus;
  /** Whichever region's raw CheckResult best represents this round's
   * consensus -- used by index.ts to populate the one consensus row's
   * diagnostic columns (http_status/response_time_ms/error_message/
   * response_snippet). See this function's own comment for exactly which
   * region gets picked and why. */
  representative: RegionVote;
};

/**
 * Majority-vote consensus across regions (#60's own acceptance criteria:
 * "majority/all configured regions agree it's down" escalates; a single
 * region's failure alone does not, and must surface as informational --
 * i.e. still visible via its own raw `checks` row, PRD-wise, but never as
 * its own independent vote toward an incident).
 *
 * Deliberately narrow and `down`-only, matching exactly what #60's
 * acceptance criteria ask for and nothing more speculative: every other
 * status (up/degraded/waking/unknown) simply passes through from the
 * first non-`down` responding region's own result -- normally
 * `PROBE_REGIONS[0]` (i.e. this pipeline's pre-#60, single-region
 * behavior, unmodified) whenever that region itself isn't the one
 * reporting a minority `down` -- unmodified otherwise. Multi-way voting
 * across the finer-grained degraded/waking/unknown states isn't asked for
 * here and would be speculative complexity; revisit if a real
 * multi-region project shows this matters in practice.
 *
 * Regions that themselves abstain (`probeFailed: true` -- the recursive
 * self-invocation to that region failed at the infrastructure level, not
 * "that region reached the project and found it down") are excluded from
 * both the vote numerator *and* denominator -- an infra hiccup calling out
 * to one region must never masquerade as a legitimate "this project is
 * down" vote. If *every* configured region abstains, there is no
 * legitimate signal at all this round; the outcome is `"unknown"`
 * (neutral for incidents.ts: doesn't escalate, doesn't resolve) rather
 * than risking a false escalation or a false auto-resolve built on zero
 * real information.
 *
 * When down isn't a majority, the representative/passthrough status is
 * the first *non-down* responding region's own result -- deliberately
 * skipping over a `down`-voting region even if it happens to be first in
 * configured order. Otherwise a single region's own minority "down" could
 * leak straight through as the round's overall status whenever that
 * specific region happened to be first, exactly the false positive #60
 * exists to eliminate (this is guaranteed to find one: if down isn't a
 * majority of `responded`, strictly more than half of `responded` is
 * non-down).
 *
 * `perRegion` must be non-empty (guaranteed by `fanOutToRegions`: one
 * entry per configured region, even on failure).
 */
export function deriveConsensusStatus(perRegion: RegionVote[]): ConsensusOutcome {
  const responded = perRegion.filter((vote) => !vote.probeFailed);

  if (responded.length === 0) {
    return { status: "unknown", representative: perRegion[0] };
  }

  const downVotes = responded.filter((vote) => vote.status === "down");
  const isMajorityDown = downVotes.length > responded.length / 2;

  if (isMajorityDown) {
    return { status: "down", representative: downVotes[0] };
  }

  const passthrough = responded.find((vote) => vote.status !== "down") ?? responded[0];
  return { status: passthrough.status, representative: passthrough };
}
