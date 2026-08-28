// Rollup Edge Function -- entry point (PRD §5.3, Phase 10, issue #62).
//
// Single request shape, POSTed here on two separate schedules (see the
// schedule_rollup_cron migration): `{ "period_type": "hourly" | "daily" }`.
// Same "no default, missing value is a 400" convention as digest/index.ts's
// own `readFrequency` -- a rollup invocation is meaningless without
// knowing which granularity fired it.
//
// Auth: service-to-service only, same `auth: "secret"` + `verify_jwt =
// false` (supabase/config.toml) as prober/notifier/digest -- all cron
// schedules authenticate with the same secret key on the `apikey` header.
//
// `ctx.supabaseAdmin` is the service-role client, required because
// rollup_hourly_checks/rollup_daily_checks (create_rollup_functions
// migration) must aggregate every project's checks in one run, not just
// one user's RLS-scoped view.
import { withSupabase } from "@supabase/server";
import { runRollup, type RollupClient, type RollupPeriodType } from "./rollup.ts";

/** Reads and validates `period_type` from the request body -- no default,
 * same reasoning as digest/index.ts's `readFrequency`: every real caller
 * (both cron schedules) always sends one explicitly. */
async function readPeriodType(req: Request): Promise<RollupPeriodType | null> {
  const body: unknown = await req.json().catch(() => null);
  const periodType = body && typeof body === "object" ? (body as Record<string, unknown>).period_type : null;
  return periodType === "hourly" || periodType === "daily" ? periodType : null;
}

const rollup = {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    const periodType = await readPeriodType(req);
    if (!periodType) {
      return Response.json(
        { error: 'request body must be {"period_type": "hourly" | "daily"}' },
        { status: 400 },
      );
    }

    // `ctx.supabaseAdmin` is `SupabaseClient<unknown>` here (no generated
    // Database type on the Deno side) -- same `unknown`-then-cast pattern
    // as digest/index.ts's own cast, avoiding postgrest-js's deeply
    // generic query builder types blowing TypeScript's instantiation depth
    // limit (TS2589) against RollupClient's narrow structural shape.
    const summary = await runRollup(ctx.supabaseAdmin as unknown as RollupClient, periodType);
    return Response.json(summary);
  }),
};

export default rollup;

/* To invoke manually (both granularities fire automatically via pg_cron --
   see the schedule_rollup_cron migration -- this is for ad hoc testing):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys (or the service_role key while that's
  still the only secret key type):

  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/rollup' \
    --header 'apikey: <SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"period_type": "hourly"}'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/rollup' \
    --header 'apikey: <SUPABASE_SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"period_type": "daily"}'

*/
