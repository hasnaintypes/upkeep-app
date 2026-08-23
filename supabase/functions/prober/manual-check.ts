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
import { writeCheckResult, type InsertableClient } from "./persist.ts";

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
  supabaseAdmin: ProjectLookupClient & InsertableClient,
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
  const persisted = await writeCheckResult(supabaseAdmin, result, status);

  return Response.json({
    manual: true,
    project_id: result.project_id,
    status,
    http_status: result.http_status,
    response_time_ms: result.response_time_ms,
    error_message: result.error_message,
    persisted: persisted.persisted,
    persist_error: persisted.error ?? null,
  });
}
