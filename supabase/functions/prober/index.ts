// Prober Edge Function -- entry point (PRD §5.2, Phase 3, issues #20-#24).
//
// Loads due projects (#20, public.get_due_projects() -- a single indexed
// query, not N+1), fires each one's HTTP health check concurrently,
// retrying per the project's own retry_count before finalizing a failure
// (#21-#23, check.ts / retry.ts), then classifies each final result into
// up/down/degraded/waking/unknown (#24, classify.ts). Deliberately does NOT
// yet write results to the `checks` table -- that's a separate, later Phase
// 3 task per docs/ROADMAP.md. For now the raw + classified per-project
// results are returned directly in the response so this stays independently
// testable.
//
// Auth: service-to-service only. Cron/Scheduled Trigger invocations (wired
// up in a later issue) and manual testing both authenticate with a secret
// key on the `apikey` header -- there is no user session here, so `auth:
// "secret"` + `verify_jwt = false` (set in supabase/config.toml) is correct,
// not a shortcut. `ctx.supabaseAdmin` is the service-role client, which is
// required here since due-project lookups must see every user's active
// projects, not just one user's RLS-scoped view -- and, unlike every
// Next.js-side read of `projects`, this one legitimately needs the *raw*
// `headers` value (bearer tokens etc.) to actually authenticate the
// outgoing health-check request. The masking from #16 is an
// application-layer (dashboard) concern, not a database-layer one.
import { withSupabase } from "@supabase/server";
import type { DueProject } from "./check.ts";
import { runHealthChecksWithRetry } from "./retry.ts";
import { classifyCheck } from "./classify.ts";

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
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
      ...result,
      status: classifyCheck(result, projectById.get(result.project_id)!),
    }));

    return Response.json({
      count: classified.length,
      results: classified,
    });
  }),
};

export default prober;

/* To invoke manually (no cron trigger exists yet -- that's a later issue):

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
