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

### Before opening a PR

```bash
pnpm lint
pnpm build
```

Run `pnpm lint` before `pnpm build`, or delete `.next/` first — a stale build directory gets linted
too and floods the output with unrelated errors from bundled JS.
