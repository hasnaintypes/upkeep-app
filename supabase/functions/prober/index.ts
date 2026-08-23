// Prober Edge Function -- entry point (PRD §5.2, Phase 3, issue #20).
//
// This issue only loads the list of projects due for a check; it does not
// fire any HTTP health-check requests yet (that's a later issue). "Due" is
// computed entirely in Postgres by the public.get_due_projects() function
// (see supabase/migrations/*_create_get_due_projects_function.sql) -- a
// single indexed query, not an N+1 loop over projects.
//
// Auth: service-to-service only. Cron/Scheduled Trigger invocations (wired
// up in a later issue) and manual testing both authenticate with a secret
// key on the `apikey` header -- there is no user session here, so `auth:
// "secret"` + `verify_jwt = false` (set in supabase/config.toml) is correct,
// not a shortcut. `ctx.supabaseAdmin` is the service-role client, which is
// required here since due-project lookups must see every user's active
// projects, not just one user's RLS-scoped view.
import { withSupabase } from "@supabase/server";

const prober = {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const { data: dueProjects, error } = await ctx.supabaseAdmin.rpc(
      "get_due_projects",
    );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      count: dueProjects?.length ?? 0,
      projects: dueProjects,
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
