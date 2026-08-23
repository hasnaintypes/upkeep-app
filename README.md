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

### Before opening a PR

```bash
pnpm lint
pnpm build
```

Run `pnpm lint` before `pnpm build`, or delete `.next/` first — a stale build directory gets linted
too and floods the output with unrelated errors from bundled JS.
