// Prober Edge Function -- entry point (PRD §5.2, Phase 3, issues #20-#21).
//
// Loads due projects (#20, public.get_due_projects() -- a single indexed
// query, not N+1) and fires each one's HTTP health check concurrently
// (#21, check.ts). Deliberately does NOT yet: classify status, retry, or
// write results to the `checks` table -- those are separate, later Phase 3
// tasks per docs/ROADMAP.md. For now the raw per-project results are
// returned directly in the response so this stays independently testable.
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
import { runHealthChecks, type DueProject } from "./check.ts";

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const { data: dueProjects, error } = await ctx.supabaseAdmin.rpc(
      "get_due_projects",
    );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const results = await runHealthChecks(
      (dueProjects ?? []) as unknown as DueProject[],
    );

    return Response.json({
      count: results.length,
      results,
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
