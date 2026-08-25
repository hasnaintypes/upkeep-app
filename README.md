# Upkeep

Self-hosted uptime and health monitor for personal/portfolio projects on free-tier hosts (Render, Railway, Fly.io, Vercel, etc.).

Free-tier hosts spin down idle services, causing slow cold starts or apparent downtime when someone opens a live demo. Upkeep periodically pings each project's health endpoint, keeps services warm, and shows a single dashboard with the status of everything — no more manually checking N different host dashboards.

## Stack

- **Backend:** Supabase (Postgres, Edge Functions, Scheduled Triggers)
- **Frontend:** Next.js dashboard, deployable independently on Vercel/Netlify/etc.

## Status

Early development. See [docs/PRD.md](docs/PRD.md) for the full product spec.

## Local Development

### Prerequisites

- Node.js 20.9+
- [pnpm](https://pnpm.io/) (via `corepack enable` or `npm i -g pnpm`)
- A [Supabase](https://supabase.com/) project (free tier is fine) — only needed for auth; the app
  still runs without one (see [Environment variables](#environment-variables) below)

### Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in your Supabase project's values
pnpm dev                     # starts the dev server on http://localhost:3000
```

Other commands:

```bash
pnpm build   # production build (also type-checks)
pnpm start   # run the production build
pnpm lint    # eslint
```

### Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable/anon key (same page) |

If left unset, Supabase auth silently no-ops (`hasEnvVars` in `src/lib/utils.ts`) — the app still
boots and the marketing pages work, but sign in/up and protected routes won't function.

Only needed for `POST /api/projects/register` (programmatic project registration):

| Variable | Description |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Project Settings → API) — server-only, bypasses RLS. Never expose to the client. |
| `UPKEEP_REGISTRATION_SECRET` | Shared secret sent as `Authorization: Bearer <secret>`. v1 stub auth pending Phase 6 per-user API keys — see the route's module comment. |
| `UPKEEP_REGISTRATION_OWNER_USER_ID` | The `auth.users.id` (uuid) that programmatically registered projects are owned by. |

Needed to invoke Edge Functions that require `auth: "secret"` (e.g. `supabase/functions/prober`) —
from the "run check now" Server Action (`src/features/projects/lib/run-check.ts`), a `pg_cron`
trigger, or manual testing:

| Variable | Description |
| --- | --- |
| `SUPABASE_SECRET_KEY` | A Supabase **Secret key** (Dashboard → Settings → API Keys → Secret keys) — distinct from `SUPABASE_SERVICE_ROLE_KEY`. Generate one there if your project only has the legacy service role key. |

### Database (Supabase CLI)

The schema lives as code in `supabase/migrations/` — never hand-author tables in the Supabase
dashboard. The CLI is pinned as a `devDependency`, so run it via `pnpm supabase ...` rather than a
globally installed version, to keep everyone on the same CLI version.

This project targets the hosted Supabase project directly (no local Docker stack):

```bash
pnpm supabase login                        # stores an access token in the CLI's global config —
                                            # never in this repo
pnpm supabase link --project-ref <ref>     # <ref> is the project ref from the Supabase dashboard URL
pnpm supabase migration new <name>         # create a new migration — the pattern for every schema change
pnpm supabase db push --dry-run            # preview which migrations would be applied
pnpm supabase db push                      # apply committed migrations to the linked project
```

`link` only needs to be run once per machine. No secrets are committed — `login` stores its token
in the CLI's global config, outside the repo.

After any migration change, regenerate the typed schema so queries stay compile-time checked
against the real database:

```bash
pnpm gen:types   # writes src/lib/supabase/types.ts from the linked project's schema
```

`createClient()` in `src/lib/supabase/client.ts` and `server.ts` are generic over the generated
`Database` type — commit `types.ts` along with the migration that changed the schema.

### Edge Functions

The prober backend lives under `supabase/functions/` (Deno runtime). Scaffold new functions with
the CLI rather than hand-creating the folder:

```bash
pnpm supabase functions new <name>                 # scaffolds supabase/functions/<name>/
pnpm supabase functions deploy <name> --use-api     # deploys to the linked project, no Docker needed
```

Functions use the `withSupabase` helper from `@supabase/server` for auth. Manually invoking a
deployed function needs a **secret key** from the dashboard (Settings → API Keys → Secret keys)
sent on the `apikey` header — the legacy `service_role` key won't pass `auth: "secret"` checks.

To verify a new SQL function/query without a local Postgres instance, run it directly against the
linked database: `pnpm supabase db query --linked "<sql>"`.

#### Prober cron trigger

The `prober` function is invoked automatically every minute by a `pg_cron` job (see the
`schedule_prober_cron` migration) — this is committed as code and requires no dashboard setup.
The one thing that *can't* be committed is the secret value the job authenticates with. After
`db push`, run once (`pnpm supabase db query --linked --file <path>` or the SQL editor):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<your SUPABASE_SECRET_KEY value>', 'prober_secret_key');
```

Until both secrets exist, the cron job runs every minute but fails harmlessly (visible in
`select * from cron.job_run_details order by start_time desc limit 5;`) since it can't build a
valid request URL/header. No projects are checked until this one-time setup is done.

The `notifier` function (fires on incident open/resolve, `#40`) is scheduled the same way — see the
`schedule_notifier_cron` migration, no dashboard setup needed there either.

#### Email notifications (Resend)

The email channel (`#44`) sends via [Resend](https://resend.com)'s HTTP API, not raw SMTP. Create a
free account, generate an API key (Dashboard → API Keys), then set it as an Edge Function secret —
this is a separate secrets store from `.env`/`.env.local`, managed via the CLI, never committed:

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

Until `RESEND_API_KEY` is set, an email-type `notification_channels` row simply fails gracefully
(logged, not thrown) on every dispatch attempt — same per-channel isolation as every other channel
type (`#40`).

### Before opening a PR

```bash
pnpm lint
pnpm build
```

Run `pnpm lint` before `pnpm build`, or delete `.next/` first — a stale build directory gets linted
too and floods the output with unrelated errors from bundled JS.
