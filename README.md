# Upkeep

Self-hosted uptime and health monitor for personal/portfolio projects on free-tier hosts (Render, Railway, Fly.io, Vercel, etc.).

Free-tier hosts spin down idle services, causing slow cold starts or apparent downtime when someone opens a live demo. Upkeep periodically pings each project's health endpoint, keeps services warm, and shows a single dashboard with the status of everything — no more manually checking N different host dashboards.

## Stack

- **Backend:** Supabase (Postgres, Edge Functions, `pg_cron` scheduled triggers)
- **Frontend:** Next.js dashboard, deployable independently on Vercel/Netlify/etc.

## Status

Early development. See [docs/PRD.md](docs/PRD.md) for the full product spec.

## Documentation

- [Health-check endpoint contract](supabase/functions/prober/HEALTH_CHECK_CONTRACT.md) — exactly
  what your project's health endpoint needs to return to be classified correctly (status codes,
  timeouts, response-time thresholds, and the optional body/JSON/TCP/DNS/SSL check types).
- [Example health-check endpoints](supabase/functions/prober/HEALTH_CHECK_EXAMPLES.md) — minimal,
  verified-working health-check snippets for Express, FastAPI, and Next.js, satisfying the
  contract above as-is.
- [Outgoing webhook payload contract](supabase/functions/notifier/WEBHOOK_PAYLOAD.md) — the exact
  JSON Upkeep POSTs to a `webhook`-type notification channel on incident open/resolve.
- [Adding a notification channel](supabase/functions/notifier/ADDING_A_CHANNEL.md) — for
  contributors: exactly what adding a new channel type (Slack, SMS, etc.) touches, verified by
  actually doing it as a proof-of-concept.
- [Adding a check type](supabase/functions/prober/ADDING_A_CHECK_TYPE.md) — for contributors: the
  same audit applied to check types (e.g. WebSocket, ping), including the plugin-architecture
  refactor this required.

## Self-hosting

Everything below gets you a working local instance — a Next.js dashboard talking to your own
Supabase project, with the prober actually monitoring a test project you add — using nothing but
this repo and a free Supabase account. Deploying the dashboard itself to Vercel/Netlify afterward
is a separate, ordinary Next.js deploy (same env vars as below); this section is about standing up
the Supabase backend, which every deployment target shares.

### Prerequisites

- Node.js 20.9+
- [pnpm](https://pnpm.io/) (via `corepack enable` or `npm i -g pnpm`)
- A free [Supabase](https://supabase.com/) account and project — required for real self-hosting
  (auth, the database, and every Edge Function below all depend on it). The dashboard's marketing
  pages will still boot without one (`hasEnvVars` in `src/lib/utils.ts` no-ops the auth gate), but
  sign-in and monitoring won't work until you've completed the setup below.
- (Optional) A free [Resend](https://resend.com) account, only if you want email notifications.

### Quick start

```bash
git clone https://github.com/hasnaintypes/upkeep-app.git
cd upkeep-app
pnpm install
pnpm supabase login   # opens your browser once, to authenticate the CLI -- can't be scripted
pnpm setup            # guided wizard: env vars, link, schema, Edge Functions, cron secrets
pnpm dev              # http://localhost:3000
```

`pnpm setup` (`scripts/setup.mjs`) is a guided wizard covering every step in
[Manual setup](#manual-setup) below: it writes `.env.local`, links your Supabase project, applies
every migration, regenerates the typed schema, deploys all five Edge Functions, and creates the
`pg_cron` secrets they share. It's safe to re-run — every step checks first or is naturally
idempotent, so stopping partway through (or running it again after a schema change) just picks up
wherever it left off. Read [Manual setup](#manual-setup) if you'd rather run each step yourself,
want to understand exactly what the script does, or need to finish a step it can't complete
headlessly (`supabase login`'s browser flow, and generating key values themselves, which are
dashboard-only either way).

### Manual setup

1. **Clone and install dependencies.**

   ```bash
   git clone https://github.com/hasnaintypes/upkeep-app.git
   cd upkeep-app
   pnpm install
   ```

2. **Create a Supabase project** (free tier is fine) at [supabase.com](https://supabase.com/), then
   authenticate and link the CLI to it — the CLI is a pinned `devDependency`, so always run it via
   `pnpm supabase ...`, never a globally installed version, to keep everyone on the same CLI
   version:

   ```bash
   pnpm supabase login                      # stores an access token in the CLI's global config, never in this repo
   pnpm supabase link --project-ref <ref>   # <ref> is the project ref from your dashboard URL
   ```

   `link` only needs to be run once per machine.

3. **Set your environment variables.** Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   then fill in every value using the table in [Environment variables](#environment-variables)
   below — all four come from your Supabase project's dashboard (Settings → API / Settings → API
   Keys), nothing needs inventing.

4. **Apply the database schema.** The schema lives as code in `supabase/migrations/` — never
   hand-author tables in the Supabase dashboard:

   ```bash
   pnpm supabase db push --dry-run   # preview which migrations would apply
   pnpm supabase db push             # apply them
   pnpm gen:types                    # regenerate src/lib/supabase/types.ts from the live schema
   ```

   `createClient()` in `src/lib/supabase/client.ts`/`server.ts` are generic over the generated
   `Database` type — always re-run `gen:types` after a schema change, and commit the result
   alongside it.

5. **Deploy the Edge Functions.** The prober backend lives under `supabase/functions/` (Deno
   runtime) — five functions, all already scaffolded and committed as code:

   | Function | Job | Schedule |
   | --- | --- | --- |
   | `prober` | Runs every due project's health check | Every 1 minute |
   | `notifier` | Sends incident-open/resolve alerts | Every 1 minute |
   | `digest` | Daily/weekly portfolio-health email | 08:00 UTC daily / Mondays |
   | `rollup` | Rolls raw checks into hourly/daily aggregates | Hourly at :05, daily at 00:10 UTC |
   | `prune` | Deletes raw checks once they're safely aggregated | Daily at 00:20 UTC |

   ```bash
   pnpm supabase functions deploy prober --use-api
   pnpm supabase functions deploy notifier --use-api
   pnpm supabase functions deploy digest --use-api
   pnpm supabase functions deploy rollup --use-api
   pnpm supabase functions deploy prune --use-api
   ```

   No Docker/local Supabase stack needed for any of this — every command targets the linked hosted
   project directly.

6. **Authenticate the cron jobs.** Every schedule above is already committed as a `pg_cron`
   migration (e.g. `schedule_prober_cron`) — no dashboard setup needed for the schedules
   themselves. The one thing that genuinely *can't* be committed is the secret value each job
   authenticates with, so it's a one-time manual step after `db push`:

   ```bash
   pnpm supabase db query --linked "select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');"
   pnpm supabase db query --linked "select vault.create_secret('<your SUPABASE_SECRET_KEY value>', 'prober_secret_key');"
   ```

   Until both secrets exist, every cron job fires on schedule but fails harmlessly (visible via
   `select * from cron.job_run_details order by start_time desc limit 5;`) since it can't build a
   valid request URL/header — no projects are checked, no notifications sent, until this is done.

7. **(Optional) Email notifications.** See [Email notifications (Resend)](#email-notifications-resend)
   below — skip this if you only want Discord/webhook alerts.

8. **Start the app.**

   ```bash
   pnpm dev   # http://localhost:3000
   ```

### Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Where to find it | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | Yes — auth/dashboard queries throw without it |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same page, Publishable key | Yes, same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` secret | Only for `POST /api/projects/register` (programmatic project registration via a per-user API key from `/dashboard/api-keys`) and other trusted server code bypassing RLS |
| `SUPABASE_SECRET_KEY` | Settings → API Keys → Secret keys (generate one if your project only shows the legacy `service_role` key) | Only for invoking `auth: "secret"` Edge Functions directly — the "run check now" Server Action, or manual testing. The *same value* also goes into the `prober_secret_key` vault secret in [Manual setup step 6](#manual-setup) |

If `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are left unset, Supabase auth
silently no-ops (`hasEnvVars` in `src/lib/utils.ts`) — the marketing pages still boot, but sign
in/up and every protected route won't function. `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`
are never exposed to the client — do not prefix either with `NEXT_PUBLIC_`.

`RESEND_API_KEY`/`RESEND_FROM_ADDRESS` are **not** `.env` variables — they're Edge Function
secrets set via `pnpm supabase secrets set ...`, a separate store entirely; see
[Email notifications (Resend)](#email-notifications-resend).

### Verify it's working

1. Sign up for an account at `http://localhost:3000/auth/sign-up`.
2. Add a project (dashboard → Add project) pointing `health_url` at any endpoint returning `200`
   quickly — one of the [example snippets](supabase/functions/prober/HEALTH_CHECK_EXAMPLES.md)
   run locally, or any real deployed service.
3. Either wait up to a minute for the `prober` cron tick to pick it up, or open the project and
   click **Run check now** for an immediate result (rate-limited to once every 30 seconds per
   project).
4. The project's status badge should flip to **Up**, and the check log on its detail page shows
   the request that just ran. If it doesn't, re-check [step 6](#manual-setup) — a missing vault
   secret is the most common reason a fresh instance's prober silently does nothing.

### Database (Supabase CLI) — day-to-day commands

```bash
pnpm supabase migration new <name>   # create a new migration -- the pattern for every schema change
pnpm supabase db push --dry-run      # preview which migrations would apply
pnpm supabase db push                # apply committed migrations to the linked project
pnpm gen:types                       # regenerate src/lib/supabase/types.ts after any schema change
```

To verify a new SQL function/query without a local Postgres instance, run it directly against the
linked database: `pnpm supabase db query --linked "<sql>"`.

### Edge Functions — day-to-day commands

```bash
pnpm supabase functions new <name>                 # scaffolds supabase/functions/<name>/
pnpm supabase functions deploy <name> --use-api    # deploys to the linked project, no Docker needed
```

Functions use the `withSupabase` helper from `@supabase/server` for auth. Manually invoking a
deployed function needs a **secret key** from the dashboard (Settings → API Keys → Secret keys)
sent on the `apikey` header — the legacy `service_role` key won't pass `auth: "secret"` checks.

### Email notifications (Resend)

The email channel sends via [Resend](https://resend.com)'s HTTP API, not raw SMTP. Create a free
account, generate an API key (Dashboard → API Keys), then set it as an Edge Function secret — a
separate secrets store from `.env`/`.env.local`, managed via the CLI, never committed:

```bash
pnpm supabase secrets set RESEND_API_KEY=<your resend api key>
```

Without a verified sending domain, Resend only allows sending from its shared
`onboarding@resend.dev` address and only *to* the email address your Resend account itself was
created with — which is exactly this app's own use case (a self-hosting user alerting themselves
about their own projects), so this is a permanent, free configuration, not a temporary sandbox
limitation to graduate out of. If you later verify a custom domain with Resend, override the
sender without any code change:

```bash
pnpm supabase secrets set RESEND_FROM_ADDRESS="Upkeep <alerts@yourdomain.com>"
```

Until `RESEND_API_KEY` is set, an email-type notification channel simply fails gracefully (logged,
not thrown) on every dispatch attempt — same per-channel isolation as every other channel type.

### Before opening a PR

```bash
pnpm lint
pnpm build
```

Run `pnpm lint` before `pnpm build`, or delete `.next/` first — a stale build directory gets linted
too and floods the output with unrelated errors from bundled JS.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for project conventions, commit message style, and how to
open an issue or PR.

## License

[MIT](LICENSE)
