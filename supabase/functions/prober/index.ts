// Prober Edge Function -- entry point (PRD §5.2, Phase 3, issues #20-#27).
//
// Loads due projects (#20, public.get_due_projects() -- a single indexed
// query, not N+1), fires each one's HTTP health check concurrently,
// retrying per the project's own retry_count before finalizing a failure
// (#21-#23, check.ts / retry.ts), classifies each final result into
// up/down/degraded/waking/unknown (#24, classify.ts), writes one `checks`
// row per project (#25, persist.ts), and records its own last-successful-
// run timestamp for self-monitoring (#27, self-monitor.ts). A `pg_cron` job
// fires this every minute (#26, see the schedule_prober_cron migration).
// Deliberately does NOT yet expose a manual "run now" trigger for a single
// project -- that's a separate, later Phase 3 task per docs/ROADMAP.md. The
// full per-project outcome (raw + classified + persisted) is still returned
// in the response too, so this stays testable/inspectable without needing
// to separately query the `checks` table after every manual invocation.
//
// Overlap protection (#26): try_acquire_prober_lock() claims a single-row
// mutex (see the schedule_prober_cron migration for why this is a claimable
// table row, not a session-scoped pg_advisory_lock -- the latter wouldn't
// reliably span the several separate PostgREST calls one invocation makes).
// If a previous run is still in progress (and not stale), this invocation
// returns immediately instead of processing the same due projects twice.
// release_prober_lock() always runs in `finally`, so an unexpected error
// mid-run can't leave the lock stuck (the stale-run fallback in
// try_acquire_prober_lock is a second, independent safety net for the case
// where the function is killed before even reaching `finally`).
//
// Self-monitoring (#27): recordProberSuccess() fires exactly once, right
// before the final response, once the whole due-check-classify-persist
// pipeline has completed without throwing -- never from the early-return
// error branches above it or from the `finally` block below, so a run that
// errors partway through correctly leaves the last-success timestamp
// stale/detectable (see self-monitor.ts).
//
// Auth: service-to-service only. The cron job above and manual testing both
// authenticate with a secret key on the `apikey` header -- there is no user
// session here, so `auth: "secret"` + `verify_jwt = false` (set in
// supabase/config.toml) is correct, not a shortcut. `ctx.supabaseAdmin` is
// the service-role client, which is required here since due-project
// lookups must see every user's active projects, not just one user's
// RLS-scoped view -- and, unlike every Next.js-side read of `projects`,
// this one legitimately needs the *raw* `headers` value (bearer tokens
// etc.) to actually authenticate the outgoing health-check request. The
// masking from #16 is an application-layer (dashboard) concern, not a
// database-layer one.
import { withSupabase } from "@supabase/server";
import type { DueProject } from "./check.ts";
import { runHealthChecksWithRetry } from "./retry.ts";
import { classifyCheck } from "./classify.ts";
import { writeCheckResults } from "./persist.ts";
import { recordProberSuccess } from "./self-monitor.ts";

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const { data: acquired, error: lockError } = await ctx.supabaseAdmin.rpc(
      "try_acquire_prober_lock",
    );

    if (lockError) {
      return Response.json({ error: lockError.message }, { status: 500 });
    }
    if (!acquired) {
      return Response.json({ skipped: true, reason: "previous run still in progress" });
    }

    try {
      const { data: dueProjects, error } = await ctx.supabaseAdmin.rpc(
        "get_due_projects",
      );

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
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
        })),
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

/* To invoke manually (fires automatically every minute via pg_cron -- see
   the schedule_prober_cron migration -- this is for ad hoc testing):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys (or the service_role key while that's
  still the only secret key type):

  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/prober' \
    --header 'apikey: <SECRET_KEY>'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/prober' \
    --header 'apikey: <SUPABASE_SECRET_KEY>'

*/
