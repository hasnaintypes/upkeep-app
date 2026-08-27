// Prober Edge Function -- entry point (PRD §5.2/§5.4/§5.8, Phase 3/5/7,
// issues #20-#28, #35-#36, #48, #60).
//
// Three request shapes, all POSTed here:
//   `{}`                              -- the scheduled batch tick (pg_cron, every minute).
//   `{ "project_id": … }`             -- a manual "run check now" for exactly one project
//                                        (#28, manual-check.ts), fired from
//                                        src/features/projects/lib/run-check.ts.
//   `{ "region_probe": { "projects": [...] } }`
//                                      -- an internal, self-invoked sub-request (#60,
//                                        region-probe.ts) the batch path below fires at
//                                        itself once per configured region -- never sent
//                                        by pg_cron or any Next.js-side caller.
//
// Batch path: loads due projects (#20, public.get_due_projects() -- a single
// indexed query, not N+1), then fans each one's check out across multiple
// AWS regions (#60, region-probe.ts's fanOutToRegions -- see that module's
// own top comment for the O(regions)-not-O(regions x projects) invocation-
// cost reasoning) rather than checking once from wherever this invocation
// itself happens to run. Each region's own sub-invocation retries per the
// project's own retry_count before finalizing a failure (#21-#23,
// check.ts/retry.ts) exactly like the pre-#60 single-region path did.
// Every region's raw result is classified into up/down/degraded/waking/
// unknown (#24, classify.ts) and written as its own `checks` row (#25,
// persist.ts, `is_consensus: false`) -- finally populating the pre-#60,
// always-null `checks.region` column. One additional "consensus" row per
// project (`is_consensus: true`, region-probe.ts's deriveConsensusStatus:
// a majority of regions must agree it's down before this round counts as
// `down`) is what actually feeds `incidents.ts`'s escalation/resolution
// streak (#35/#36) and self-monitoring (#27, self-monitor.ts) -- unchanged
// from the pre-#60 single-region behavior in every other respect. A
// `pg_cron` job fires the batch tick every minute (#26, see the
// schedule_prober_cron migration). The full per-project outcome (every
// region's raw result + the consensus + persisted + incident) is still
// returned in the response too, so this stays testable/inspectable
// without needing to separately query the `checks`/`incidents` tables
// after every manual invocation.
//
// Keep-alive path (#48, batch tick only -- see keep-alive.ts's own module
// comment for the full rationale): runs unconditionally on every batch
// invocation, entirely independent of the monitoring pipeline above -- its
// own due-project query (get_due_keep_alive_projects(), keyed off
// keep_alive_enabled, not is_active/check_interval_seconds) and its own
// due-ness tracking column (projects.last_keep_alive_at, not the `checks`
// table), so a keep-alive ping never writes a `checks` row or feeds
// incident detection. Runs before the monitoring lock/pipeline below and
// isn't gated by it -- see the "Overlap protection" note. Not regionally
// fanned out (#60) -- a keep-alive ping's whole point is just "wake up the
// free-tier host", not a monitored signal, so there's nothing for multiple
// regions to reach consensus about.
//
// Manual path (#28): reuses the exact same check/retry/classify/persist
// modules for one project id handed to it directly, instead of asking
// get_due_projects() -- see manual-check.ts's own module comment for why it
// deliberately skips the batch lock and self-monitoring below. Does not run
// the keep-alive path either -- that's an automatic background schedule,
// not something a manual "run check now" click should trigger. Also not
// regionally fanned out (#60), deliberately -- a user-triggered ad hoc
// single check tripling its own outbound request/invocation cost for one
// button click isn't asked for by #60's acceptance criteria, and manual-
// check.ts already tags its one row with whatever region it happens to
// execute in (informational, see that module's own comment).
//
// Region-probe path (#60): the leanest of the three branches, and the only
// one that must NOT touch prober_lock -- it isn't a top-level scheduling
// entry point, it's an internal implementation detail of an
// already-lock-held batch tick (the orchestrator below is still awaiting
// this very sub-invocation when it runs), so acquiring the same single-row
// mutex again here would immediately self-deadlock (the lock's already
// held by the caller). Doesn't classify/persist/touch incidents either --
// see region-probe.ts's runRegionProbe for why that all happens back in
// the orchestrator once every region's raw results are in hand.
//
// Overlap protection (#26, monitoring batch path only -- see keep-alive.ts
// for why the keep-alive path above deliberately isn't covered by this same
// lock): try_acquire_prober_lock()
// claims a single-row mutex (see the schedule_prober_cron migration for why
// this is a claimable table row, not a session-scoped pg_advisory_lock --
// the latter wouldn't reliably span the several separate PostgREST calls
// one invocation makes). If a previous run is still in progress (and not
// stale), this invocation returns immediately instead of processing the
// same due projects twice. release_prober_lock() always runs in `finally`,
// so an unexpected error mid-run can't leave the lock stuck (the stale-run
// fallback in try_acquire_prober_lock is a second, independent safety net
// for the case where the function is killed before even reaching
// `finally`). Still exactly one lock, one `get_due_projects()` call, one
// pg_cron-triggered invocation per tick, even with #60's regional fan-out --
// the N recursive region-probe sub-invocations are internal to this one
// locked run, not additional top-level ticks competing for the same lock.
//
// Self-monitoring (#27, batch path only): recordProberSuccess() fires
// exactly once, right before the final response, once the whole due-check-
// classify-persist pipeline has completed without throwing -- never from
// the early-return error branches above it or from the `finally` block
// below, so a run that errors partway through correctly leaves the
// last-success timestamp stale/detectable (see self-monitor.ts).
//
// Auth: service-to-service only, for all three request shapes -- including
// #60's region-probe sub-invocations, which authenticate with the exact
// same secret key as everything else (see region-probe.ts's fanOutToRegions),
// not some separate internal-only credential. The cron job above, manual
// testing, and the "run check now" Server Action all authenticate with a
// secret key on the `apikey` header -- there is no user session here, so
// `auth: "secret"` + `verify_jwt = false` (set in supabase/config.toml) is
// correct, not a shortcut. Ownership of the project being manually checked
// is verified one layer up, before this function is ever invoked (see
// manual-check.ts's module comment).
// `ctx.supabaseAdmin` is the service-role client, which is required here
// since due-project lookups must see every user's active projects, not
// just one user's RLS-scoped view -- and, unlike every Next.js-side read of
// `projects`, this one legitimately needs the *raw* `headers` value (bearer
// tokens etc.) to actually authenticate the outgoing health-check request.
// The masking from #16 is an application-layer (dashboard) concern, not a
// database-layer one.
import { withSupabase } from "@supabase/server";
import type { DueProject } from "./check.ts";
import { classifyCheck } from "./classify.ts";
import { readEnv } from "./env.ts";
import { writeCheckResults, type WriteCheckResultOptions } from "./persist.ts";
import { recordProberSuccess } from "./self-monitor.ts";
import { runManualCheck, type ProjectLookupClient } from "./manual-check.ts";
import type { InsertableClient } from "./persist.ts";
import { maybeOpenIncidents, maybeResolveIncidents, type IncidentClient } from "./incidents.ts";
import { runKeepAlivePings, type KeepAliveClient } from "./keep-alive.ts";
import { applyRateLimitBackoff, isRateLimited, type BackoffClient } from "./rate-limit.ts";
import {
  deriveConsensusStatus,
  fanOutToRegions,
  parseRegionProbeProjects,
  runRegionProbe,
  type RegionVote,
} from "./region-probe.ts";

/** Reads an optional `project_id` out of an already-parsed request body.
 * Malformed/empty bodies (including pg_cron's literal `{}`) resolve to
 * `null`, not a thrown error -- absence of a project id just means "try
 * the next request shape". Takes the pre-parsed body (not the raw
 * `Request`) so the single `req.json()` read below can be shared across
 * this and `parseRegionProbeProjects` (#60) -- a `Request` body can only
 * be consumed once. */
function readManualProjectId(body: unknown): string | null {
  const projectId =
    body && typeof body === "object" ? (body as Record<string, unknown>).project_id : null;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

/** This function's own public invocation URL, used by #60's fanOutToRegions
 * to recursively call itself with a forced `x-region`. `SUPABASE_URL` is
 * one of the Edge Runtime's default secrets (the same API gateway URL
 * `NEXT_PUBLIC_SUPABASE_URL` points at from the Next.js side), so no extra
 * setup/secret is required beyond what every Supabase Edge Function
 * already has. */
function getProberUrl(): string {
  return `${readEnv("SUPABASE_URL")}/functions/v1/prober`;
}

/** The `secret`-mode API key #60's recursive self-invocations authenticate
 * with -- the exact same auth wall every other caller of this function
 * (pg_cron, the "run check now" Server Action) already goes through, read
 * from `SUPABASE_SECRET_KEYS` (another Edge Runtime default secret, a JSON
 * dictionary; `"default"` matches bare `auth: "secret"`'s own validation
 * target -- see @supabase/server's auth-modes docs). Returns `null` if
 * that secret isn't available for some reason, so the caller can degrade
 * (skip the regional fan-out for this tick, see below) instead of throwing. */
function getSecretKey(): string | null {
  try {
    const keys = JSON.parse(readEnv("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? null;
  } catch {
    return null;
  }
}

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    const body: unknown = await req.json().catch(() => null);

    // #60: an internal sub-invocation of this same function, requested by
    // the batch path below (via fanOutToRegions) with a forced `x-region`.
    // Checked first since it's the leanest branch and never overlaps with
    // the other two shapes -- see this file's own top comment for why it
    // must not touch prober_lock/keep-alive/incidents/self-monitoring.
    const regionProbeProjects = parseRegionProbeProjects(body);
    if (regionProbeProjects) {
      return Response.json(await runRegionProbe(regionProbeProjects));
    }

    const manualProjectId = readManualProjectId(body);
    if (manualProjectId) {
      // `ctx.supabaseAdmin` is `SupabaseClient<unknown>` here (no generated
      // Database type on the Deno side -- see index.ts's own top comment on
      // why the batch path below casts get_due_projects() the same way).
      // Going through `unknown` avoids TypeScript trying to structurally
      // unify postgrest-js's real (deeply generic) query builder types
      // against ProjectLookupClient/InsertableClient's narrow shapes, which
      // otherwise blows the type-checker's instantiation depth limit
      // (TS2589) without changing anything at runtime.
      return runManualCheck(
        ctx.supabaseAdmin as unknown as ProjectLookupClient &
          InsertableClient &
          IncidentClient &
          BackoffClient,
        manualProjectId,
      );
    }

    // #48: runs on every batch tick, independent of the monitoring lock/
    // pipeline below (including the `!acquired` skip branch) -- see
    // keep-alive.ts's module comment for why. Never throws/rejects, so a
    // keep-alive failure can't prevent the monitoring batch from running.
    const keepAlive = await runKeepAlivePings(
      ctx.supabaseAdmin as unknown as KeepAliveClient,
    );

    const { data: acquired, error: lockError } = await ctx.supabaseAdmin.rpc(
      "try_acquire_prober_lock",
    );

    if (lockError) {
      return Response.json({ error: lockError.message, keep_alive: keepAlive }, { status: 500 });
    }
    if (!acquired) {
      return Response.json({
        skipped: true,
        reason: "previous run still in progress",
        keep_alive: keepAlive,
      });
    }

    try {
      const { data: dueProjects, error } = await ctx.supabaseAdmin.rpc(
        "get_due_projects",
      );

      if (error) {
        return Response.json({ error: error.message, keep_alive: keepAlive }, { status: 500 });
      }

      const projects = (dueProjects ?? []) as unknown as DueProject[];
      const projectById = new Map(projects.map((p) => [p.id, p]));

      // #60: fan out to every configured region -- skipped entirely when
      // there's nothing due, so an empty tick doesn't burn three pointless
      // self-invocations. `secretKey === null` (SUPABASE_SECRET_KEYS
      // unexpectedly missing) degrades the same way: zero region batches,
      // which `deriveConsensusStatus` below already treats as "every
      // region abstained" -> `unknown`, never a false escalation/resolve.
      const secretKey = getSecretKey();
      const regionBatches =
        projects.length > 0 && secretKey
          ? await fanOutToRegions(projects, { proberUrl: getProberUrl(), secretKey })
          : [];
      if (projects.length > 0 && !secretKey) {
        console.error(
          "[prober] SUPABASE_SECRET_KEYS unavailable -- skipping regional fan-out for this tick",
        );
      }

      // Reshape region-major batches into project-major votes: for each
      // due project, one classified RegionVote per region that actually
      // returned a result for it.
      const votesByProject = new Map<string, RegionVote[]>();
      for (const batch of regionBatches) {
        for (const result of batch.results) {
          const project = projectById.get(result.project_id);
          if (!project) continue; // Defensive -- every result should map back to a due project.
          const status = classifyCheck(result, project);
          const votes = votesByProject.get(result.project_id) ?? [];
          votes.push({ region: batch.region, status, result, probeFailed: batch.probeFailed });
          votesByProject.set(result.project_id, votes);
        }
      }

      const perProject = projects.map((project) => {
        const perRegion = votesByProject.get(project.id) ?? [];
        // `deriveConsensusStatus` requires a non-empty array (documented on
        // that function) -- `perRegion` can only be empty here if
        // `regionBatches` came back empty entirely (e.g. `secretKey` was
        // unavailable above, or every region batch's results somehow
        // didn't include this specific project). A synthetic single-entry
        // `probeFailed` placeholder routes this through the exact same
        // "every region abstained -> unknown" safety net as a real
        // all-regions-failed round, without ever being persisted as its
        // own `checks` row (only `perRegion`, not this placeholder, feeds
        // `regionalEntries` below).
        const consensus = deriveConsensusStatus(
          perRegion.length > 0
            ? perRegion
            : [
                {
                  region: "none",
                  status: "unknown",
                  probeFailed: true,
                  result: {
                    project_id: project.id,
                    http_status: null,
                    response_time_ms: 0,
                    response_snippet: null,
                    error_message: "No regional probe data available for this round.",
                    timed_out: false,
                    attempts: 0,
                  },
                },
              ],
        );
        return { project, perRegion, consensus };
      });

      // One raw row per region (diagnostic visibility, `is_consensus:
      // false` -- see the add_multi_region_probing migration) plus one
      // consensus row per project (`is_consensus: true`, the only row
      // incidents.ts's escalation/resolution streak reads).
      const regionalEntries = perProject.flatMap(({ perRegion }) =>
        perRegion.map((vote) => ({
          result: vote.result,
          status: vote.status,
          options: { region: vote.region, isConsensus: false } satisfies WriteCheckResultOptions,
        })),
      );
      const consensusEntries = perProject.map(({ consensus }) => ({
        result: consensus.representative.result,
        status: consensus.status,
        options: {
          isRateLimited: isRateLimited(consensus.representative.result),
        } satisfies WriteCheckResultOptions,
      }));

      // #61: grows/clears each project's own rate-limit backoff window
      // based on this round's consensus result, concurrently with (not
      // blocking on) the checks-row writes below -- an independent piece
      // of per-project state, same reasoning as running regional/consensus
      // writes concurrently with each other.
      const backoffUpdates = perProject.map(({ project, consensus }) =>
        applyRateLimitBackoff(
          ctx.supabaseAdmin as unknown as BackoffClient,
          project.id,
          project,
          isRateLimited(consensus.representative.result),
        ),
      );

      const [regionalPersisted, consensusPersisted] = await Promise.all([
        writeCheckResults(ctx.supabaseAdmin, regionalEntries),
        writeCheckResults(ctx.supabaseAdmin, consensusEntries),
        Promise.all(backoffUpdates),
      ]);
      void regionalPersisted; // Diagnostic rows only -- nothing downstream keys off their write outcome.
      const consensusPersistedById = new Map(
        perProject.map(({ project }, index) => [project.id, consensusPersisted[index]]),
      );

      // Incident detection/resolution (#35/#36) only makes sense against a
      // `checks` row that's actually on disk -- a project whose consensus
      // write just failed above is skipped here rather than evaluated
      // against stale/missing data. `maybeOpenIncidents`/`maybeResolveIncidents`
      // are each a no-op (no query at all) for a status the other one owns --
      // down/degraded only ever opens, up only ever resolves -- so running
      // both over every entry is just as cheap as branching by status
      // ourselves.
      const incidentInputs = perProject
        .filter(({ project }) => consensusPersistedById.get(project.id)?.persisted)
        .map(({ project, consensus }) => ({ project_id: project.id, status: consensus.status }));
      const incidentClient = ctx.supabaseAdmin as unknown as IncidentClient;
      const [opened, resolved] = await Promise.all([
        maybeOpenIncidents(incidentClient, incidentInputs),
        maybeResolveIncidents(incidentClient, incidentInputs),
      ]);
      const incidentByProjectId = new Map(
        incidentInputs.map((entry, index) => [
          entry.project_id,
          { opened: opened[index], resolved: resolved[index] },
        ]),
      );

      // The pipeline ran to completion without throwing -- a genuine
      // success (#27), regardless of whether any individual project's own
      // check came back down/unknown or failed to persist (both already
      // isolated per-project above, not run-level failures).
      await recordProberSuccess(ctx.supabaseAdmin);

      return Response.json({
        count: perProject.length,
        results: perProject.map(({ project, perRegion, consensus }) => ({
          project_id: project.id,
          status: consensus.status,
          http_status: consensus.representative.result.http_status,
          response_time_ms: consensus.representative.result.response_time_ms,
          error_message:
            consensus.representative.result.error_message ??
            consensus.representative.result.jsonAssertionError ??
            null,
          regions: perRegion.map((vote) => ({
            region: vote.region,
            status: vote.status,
            probe_failed: vote.probeFailed,
            http_status: vote.result.http_status,
            response_time_ms: vote.result.response_time_ms,
            error_message: vote.result.error_message ?? vote.result.jsonAssertionError ?? null,
          })),
          persisted: consensusPersistedById.get(project.id)?.persisted ?? false,
          persist_error: consensusPersistedById.get(project.id)?.error ?? null,
          incident: incidentByProjectId.get(project.id) ?? null,
        })),
        keep_alive: keepAlive,
      });
    } finally {
      const { error: releaseError } = await ctx.supabaseAdmin.rpc(
        "release_prober_lock",
      );
      if (releaseError) {
        console.error(`[prober] failed to release run lock: ${releaseError.message}`);
      }
    }
  }),
};

export default prober;

/* To invoke manually (the batch tick fires automatically every minute via
   pg_cron -- see the schedule_prober_cron migration -- this is for ad hoc
   testing; the region-probe shape is internal-only, see this file's own
   top comment, and isn't meant to be invoked directly by a human):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys (or the service_role key while that's
  still the only secret key type):

  # Batch tick (same as what pg_cron sends):
  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/prober' \
    --header 'apikey: <SECRET_KEY>'

  # Manual single-project check (#28, same shape the "run check now" Server
  # Action sends):
  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/prober' \
    --header 'apikey: <SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"project_id": "<project-uuid>"}'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/prober' \
    --header 'apikey: <SUPABASE_SECRET_KEY>'

*/
