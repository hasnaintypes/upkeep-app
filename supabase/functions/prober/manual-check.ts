// Manual "run check now" for a single project (PRD §5.2/§3, Phase 3, issue #28).
//
// Reuses the exact same check/retry/classify/persist pipeline as the
// scheduled batch path (check.ts/retry.ts/classify.ts/persist.ts) -- the
// only difference is *which* project gets checked and when: the batch path
// (index.ts's default branch) asks get_due_projects() which projects are
// due right now; this path is handed exactly one project id directly and
// checks it immediately, bypassing check_interval_seconds entirely.
//
// Trust boundary: by the time a request reaches here (see index.ts), the
// caller has already been authenticated as `auth: "secret"` -- same as the
// batch tick -- and ownership + rate limiting have already been enforced
// one layer up, in src/features/projects/lib/run-check.ts's RLS-scoped
// try_claim_manual_check() RPC call, *before* that Server Action ever
// invokes this Edge Function. This module itself has no concept of "which
// user asked for this" -- it only knows a project id, exactly like the
// batch path only knows project ids returned by get_due_projects().
//
// Deliberately does NOT touch prober_lock (that mutex protects against
// overlapping *batch* runs re-processing the same due projects; a one-off
// manual check is independent of the batch tick and shouldn't be blocked
// by, or block, it) and does NOT call recordProberSuccess() (self-
// monitoring tracks the scheduled tick's health specifically -- a manual
// check succeeding says nothing about whether pg_cron is still firing, see
// self-monitor.ts).
import type { DueProject } from "./check.ts";
import { runHealthCheckWithRetry } from "./retry.ts";
import { classifyCheck } from "./classify.ts";
import { readEnv } from "./env.ts";
import { writeCheckResult, type InsertableClient } from "./persist.ts";
import { maybeOpenIncident, maybeResolveIncident, type IncidentClient } from "./incidents.ts";

/** The minimal shape this module needs to look up one project by id --
 * mirrors persist.ts's InsertableClient in spirit: narrow and structural,
 * so it's testable against a fake without the real supabase-js client. */
export type ProjectLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: DueProject | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * Looks up one project by id, runs it through the same retry-aware check +
 * classification + persistence pipeline as a scheduled tick, and returns
 * the outcome as a Response. Unlike the batch path, this always looks the
 * project up directly (not via get_due_projects()) and checks it
 * regardless of is_active or how recently it was last checked -- due-ness
 * is a batch-scheduling concern, not a manual-trigger one.
 */
export async function runManualCheck(
  supabaseAdmin: ProjectLookupClient & InsertableClient & IncidentClient,
  projectId: string,
): Promise<Response> {
  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const result = await runHealthCheckWithRetry(project);
  const status = classifyCheck(result, project);
  // `region` is informational only here (#60) -- a manual check is always
  // a single-vantage-point probe, whatever region it happens to execute
  // in (Supabase's Edge Runtime routes it wherever's nearest, same as any
  // other call that doesn't force a specific one via `x-region`), and
  // `isConsensus` stays at persist.ts's own default (`true`): a manual
  // check must keep counting toward incidents.ts's escalation/resolution
  // streak exactly as it always has, unaffected by the batch tick's own
  // multi-region fan-out.
  const persisted = await writeCheckResult(supabaseAdmin, result, status, {
    region: readEnv("SB_REGION") ?? null,
  });

  // Same incident detection/resolution (#35/#36) as the batch path -- a
  // manual "run check now" can just as validly be the check that crosses
  // the escalation threshold or confirms recovery, and skips both the same
  // way on a failed write (persisted === false means there's no new
  // `checks` row for either to see). Only one of the two ever actually
  // queries anything for a given `status` (see incidents.ts), so running
  // both unconditionally is no more expensive than branching here first.
  const incident = persisted.persisted
    ? {
        opened: await maybeOpenIncident(supabaseAdmin, result.project_id, status),
        resolved: await maybeResolveIncident(supabaseAdmin, result.project_id, status),
      }
    : null;

  return Response.json({
    manual: true,
    project_id: result.project_id,
    status,
    http_status: result.http_status,
    response_time_ms: result.response_time_ms,
    // Falls back to `jsonAssertionError` (#59), same reasoning as
    // persist.ts's own `error_message` column write -- a JSON path/value
    // assertion failure is a successful response as far as CheckResult's
    // own `error_message` field is concerned (see classify.ts's top
    // comment), so this response would otherwise report `null` for a
    // check this same call just classified/persisted as `down`.
    error_message: result.error_message ?? result.jsonAssertionError ?? null,
    persisted: persisted.persisted,
    persist_error: persisted.error ?? null,
    incident,
  });
}
