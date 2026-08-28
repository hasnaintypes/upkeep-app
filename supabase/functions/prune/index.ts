// Prune Edge Function -- entry point (PRD §5.3/§10, Phase 10, issue #63).
//
// No required request body -- unlike digest/rollup (which need to know
// which cadence/granularity fired them), prune has exactly one thing to
// do per invocation, same "empty body triggers the one thing this
// function does" shape as the prober/notifier's own batch tick. An
// optional `{"retention_days": N}` override is accepted for ad hoc manual
// testing (see runPrune's own default), but the scheduled cron job (see
// schedule_prune_cron) always POSTs an empty body and gets PRD §10's
// decided 7-day default.
//
// Auth: service-to-service only, same `auth: "secret"` + `verify_jwt =
// false` (supabase/config.toml) as prober/notifier/digest/rollup.
//
// `ctx.supabaseAdmin` is the service-role client, required because
// `prune_raw_checks` (create_prune_function migration) must delete rows
// across every project in one run, not just one user's RLS-scoped view --
// and `checks` has no delete policy at all (only service_role writes it).
import { withSupabase } from "@supabase/server";
import { runPrune, type PruneClient } from "./prune.ts";

/** Reads an optional `retention_days` override from the request body --
 * unlike digest/rollup's `readFrequency`/`readPeriodType`, there's no
 * "missing value is a 400" here: an absent/invalid value just means "use
 * the decided default," not "the caller forgot something required." */
async function readRetentionDaysOverride(req: Request): Promise<number | undefined> {
  const body: unknown = await req.json().catch(() => null);
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).retention_days : null;
  return typeof value === "number" && value > 0 ? value : undefined;
}

const prune = {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    const retentionDaysOverride = await readRetentionDaysOverride(req);

    // `ctx.supabaseAdmin` is `SupabaseClient<unknown>` here (no generated
    // Database type on the Deno side) -- same `unknown`-then-cast pattern
    // as rollup/index.ts's own cast, avoiding postgrest-js's deeply
    // generic query builder types blowing TypeScript's instantiation depth
    // limit (TS2589) against PruneClient's narrow structural shape.
    const summary = await runPrune(ctx.supabaseAdmin as unknown as PruneClient, retentionDaysOverride);
    return Response.json(summary);
  }),
};

export default prune;

/* To invoke manually (the daily cron already does this automatically --
   see the schedule_prune_cron migration -- this is for ad hoc testing):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys (or the service_role key while that's
  still the only secret key type):

  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/prune' \
    --header 'apikey: <SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{}'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/prune' \
    --header 'apikey: <SUPABASE_SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"retention_days": 7}'

*/
