// Prober Edge Function -- entry point (PRD §5.2/§5.4/§5.8, Phase 3/5/7,
// issues #20-#28, #35-#36, #48).
//
// Two request shapes, both POSTed here:
//   `{}`                  -- the scheduled batch tick (pg_cron, every minute).
//   `{ "project_id": … }` -- a manual "run check now" for exactly one project
//                            (#28, manual-check.ts), fired from
//                            src/features/projects/lib/run-check.ts.
//
// Batch path: loads due projects (#20, public.get_due_projects() -- a single
// indexed query, not N+1), fires each one's HTTP health check concurrently,
// retrying per the project's own retry_count before finalizing a failure
// (#21-#23, check.ts / retry.ts), classifies each final result into
// up/down/degraded/waking/unknown (#24, classify.ts), writes one `checks`
// row per project (#25, persist.ts), opens/resolves `incidents` rows off the
// resulting streaks (#35/#36, incidents.ts), and records its own last-
// successful-run timestamp for self-monitoring (#27, self-monitor.ts). A
// `pg_cron` job fires this every minute (#26, see the schedule_prober_cron
// migration). The full per-project outcome (raw + classified + persisted +
// incident) is still returned in the response too, so this stays testable/
// inspectable without needing to separately query the `checks`/`incidents`
// tables after every manual invocation.
//
// Keep-alive path (#48, batch tick only -- see keep-alive.ts's own module
// comment for the full rationale): runs unconditionally on every batch
// invocation, entirely independent of the monitoring pipeline above -- its
// own due-project query (get_due_keep_alive_projects(), keyed off
// keep_alive_enabled, not is_active/check_interval_seconds) and its own
// due-ness tracking column (projects.last_keep_alive_at, not the `checks`
// table), so a keep-alive ping never writes a `checks` row or feeds
// incident detection. Runs before the monitoring lock/pipeline below and
// isn't gated by it -- see the "Overlap protection" note.
//
// Manual path (#28): reuses the exact same check/retry/classify/persist
// modules for one project id handed to it directly, instead of asking
// get_due_projects() -- see manual-check.ts's own module comment for why it
// deliberately skips the batch lock and self-monitoring below. Does not run
// the keep-alive path either -- that's an automatic background schedule,
// not something a manual "run check now" click should trigger.
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
// `finally`).
//
// Self-monitoring (#27, batch path only): recordProberSuccess() fires
// exactly once, right before the final response, once the whole due-check-
// classify-persist pipeline has completed without throwing -- never from
// the early-return error branches above it or from the `finally` block
// below, so a run that errors partway through correctly leaves the
// last-success timestamp stale/detectable (see self-monitor.ts).
//
// Auth: service-to-service only, for both request shapes. The cron job
// above, manual testing, and the "run check now" Server Action all
// authenticate with a secret key on the `apikey` header -- there is no user
// session here, so `auth: "secret"` + `verify_jwt = false` (set in
// supabase/config.toml) is correct, not a shortcut. Ownership of the
// project being manually checked is verified one layer up, before this
// function is ever invoked (see manual-check.ts's module comment).
// `ctx.supabaseAdmin` is the service-role client, which is required here
// since due-project lookups must see every user's active projects, not
// just one user's RLS-scoped view -- and, unlike every Next.js-side read of
// `projects`, this one legitimately needs the *raw* `headers` value (bearer
// tokens etc.) to actually authenticate the outgoing health-check request.
// The masking from #16 is an application-layer (dashboard) concern, not a
// database-layer one.
import { withSupabase } from "@supabase/server";
import type { DueProject } from "./check.ts";
import { runHealthChecksWithRetry } from "./retry.ts";
import { classifyCheck } from "./classify.ts";
import { writeCheckResults } from "./persist.ts";
import { recordProberSuccess } from "./self-monitor.ts";
import { runManualCheck, type ProjectLookupClient } from "./manual-check.ts";
import type { InsertableClient } from "./persist.ts";
import { maybeOpenIncidents, maybeResolveIncidents, type IncidentClient } from "./incidents.ts";
import { runKeepAlivePings, type KeepAliveClient } from "./keep-alive.ts";

/** Reads an optional `project_id` out of the request body. Malformed/empty
 * bodies (including pg_cron's literal `{}`) resolve to `null`, not a thrown
 * error -- absence of a project id just means "run the normal batch tick". */
async function readManualProjectId(req: Request): Promise<string | null> {
  const body: unknown = await req.json().catch(() => null);
  const projectId =
    body && typeof body === "object" ? (body as Record<string, unknown>).project_id : null;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    const manualProjectId = await readManualProjectId(req);
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
        ctx.supabaseAdmin as unknown as ProjectLookupClient & InsertableClient & IncidentClient,
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
      const results = await runHealthChecksWithRetry(projects);
      const projectById = new Map(projects.map((p) => [p.id, p]));

      const classified = results.map((result) => ({
        result,
        status: classifyCheck(result, projectById.get(result.project_id)!),
      }));

      const persisted = await writeCheckResults(ctx.supabaseAdmin, classified);
      const persistedById = new Map(persisted.map((p) => [p.project_id, p]));

      // Incident detection/resolution (#35/#36) only makes sense against a
      // `checks` row that's actually on disk -- a project whose write just
      // failed above is skipped here rather than evaluated against stale/
      // missing data. `maybeOpenIncidents`/`maybeResolveIncidents` are each
      // a no-op (no query at all) for a status the other one owns -- down/
      // degraded only ever opens, up only ever resolves -- so running both
      // over every entry is just as cheap as branching by status ourselves.
      const incidentInputs = classified
        .filter(({ result }) => persistedById.get(result.project_id)?.persisted)
        .map(({ result, status }) => ({ project_id: result.project_id, status }));
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
        count: classified.length,
        results: classified.map(({ result, status }) => ({
          ...result,
          status,
          persisted: persistedById.get(result.project_id)?.persisted ?? false,
          persist_error: persistedById.get(result.project_id)?.error ?? null,
          incident: incidentByProjectId.get(result.project_id) ?? null,
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
   testing of either request shape):

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
