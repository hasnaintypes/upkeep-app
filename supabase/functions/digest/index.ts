// Digest Edge Function -- entry point (PRD §5.5, Phase 6, issue #46).
//
// Single request shape, POSTed here on two separate schedules (see the
// schedule_digest_cron migration): `{ "frequency": "daily" | "weekly" }`.
// There is no batch-tick-with-no-body shape like the prober/notifier have
// -- a digest invocation is meaningless without knowing which cadence
// fired it, so a missing/invalid `frequency` is a 400, not a silent no-op.
//
// Auth: service-to-service only, same `auth: "secret"` + `verify_jwt =
// false` (supabase/config.toml) as prober/notifier -- both cron schedules
// authenticate with the same secret key on the `apikey` header. See
// prober/index.ts's own module comment for the fuller rationale, unchanged
// here.
//
// `ctx.supabaseAdmin` is the service-role client, required because
// `get_digest_recipients`/`get_user_portfolio_summary` (create_digest_
// functions migration) must see every user's data in one run, not just one
// user's RLS-scoped view -- see that migration's own top comment for why
// both RPCs are service_role-only rather than reusing the dashboard's
// authenticated-only uptime functions as-is.
import { withSupabase } from "@supabase/server";
import { runDigest, type DigestClient, type DigestFrequency } from "./digest.ts";

/** Reads and validates `frequency` from the request body. Unlike prober's
 * `readManualProjectId` (where an absent value has a sensible default --
 * "run the normal batch tick"), there is no default cadence here: every
 * real caller (both cron schedules) always sends one explicitly, so a
 * missing/invalid value means something is misconfigured and should be
 * surfaced as an error, not silently treated as e.g. "daily". */
async function readFrequency(req: Request): Promise<DigestFrequency | null> {
  const body: unknown = await req.json().catch(() => null);
  const frequency = body && typeof body === "object" ? (body as Record<string, unknown>).frequency : null;
  return frequency === "daily" || frequency === "weekly" ? frequency : null;
}

const digest = {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    const frequency = await readFrequency(req);
    if (!frequency) {
      return Response.json(
        { error: 'request body must be {"frequency": "daily" | "weekly"}' },
        { status: 400 },
      );
    }

    // `ctx.supabaseAdmin` is `SupabaseClient<unknown>` here (no generated
    // Database type on the Deno side) -- same `unknown`-then-cast pattern
    // as prober/notifier's own index.ts, avoiding postgrest-js's deeply
    // generic query builder types blowing TypeScript's instantiation depth
    // limit (TS2589) against DigestClient's narrow structural shape.
    const summary = await runDigest(ctx.supabaseAdmin as unknown as DigestClient, frequency);
    return Response.json(summary);
  }),
};

export default digest;

/* To invoke manually (both cadences fire automatically via pg_cron -- see
   the schedule_digest_cron migration -- this is for ad hoc testing):

  Against the hosted project, using a secret key from
  Settings > API Keys > Secret keys (or the service_role key while that's
  still the only secret key type):

  curl -i --location --request POST \
    'https://<project-ref>.supabase.co/functions/v1/digest' \
    --header 'apikey: <SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"frequency": "daily"}'

  Locally (requires Docker + `supabase start`, which this project doesn't
  otherwise use -- see AGENTS.md):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/digest' \
    --header 'apikey: <SUPABASE_SECRET_KEY>' \
    --header 'Content-Type: application/json' \
    --data '{"frequency": "weekly"}'

*/
