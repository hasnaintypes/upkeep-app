// Notifier Edge Function -- entry point (PRD §5.5, Phase 6, issue #40).
//
// Fires on a fixed schedule (pg_cron, see the schedule_notifier_cron
// migration), polling the `incidents` table Phase 5 already writes to
// (#35/#36) for open/resolve transitions that haven't been announced yet
// -- see notifier.ts's own module comment for the full reasoning on why
// this is a scheduled poll rather than a fire-and-forget call from the
// prober's own request lifecycle, the idempotency model
// (`notified`/`resolved_notified`), and the v1 retry/escalation-threshold
// scope decisions.
//
// Auth: service-to-service only, same reasoning as prober/index.ts --
// there is no user session here (pg_cron is the only caller), so
// `auth: "secret"` + `verify_jwt = false` (set in supabase/config.toml) is
// correct. `ctx.supabaseAdmin` is the service-role client, required since
// this needs to read every user's incidents/projects/notification rules
// across the whole system, not one user's RLS-scoped view, and legitimately
// needs each channel's raw (unmasked) `config` to actually dispatch --
// same trust level as the prober needing raw project `headers`.
import { withSupabase } from "@supabase/server";
import { runNotifier, type NotifierClient } from "./notifier.ts";

const notifier = {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    // Going through `unknown` avoids TypeScript trying to structurally
    // unify postgrest-js's real (deeply generic) query builder types
    // against `NotifierClient`'s narrow shape -- same reasoning as
    // prober/index.ts's own identical cast for `IncidentClient` et al.
    const summary = await runNotifier(ctx.supabaseAdmin as unknown as NotifierClient);

    return Response.json(summary);
  }),
};

export default notifier;

/* To invoke manually (the scheduled run fires automatically via pg_cron --
   see the schedule_notifier_cron migration -- this is for ad hoc testing):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys:

  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/notifier' \
    --header 'apikey: <SECRET_KEY>'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/notifier' \
    --header 'apikey: <SUPABASE_SECRET_KEY>'

*/
