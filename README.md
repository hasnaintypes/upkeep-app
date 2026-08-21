# Upkeep

Self-hosted uptime and health monitor for personal/portfolio projects on free-tier hosts (Render, Railway, Fly.io, Vercel, etc.).

Free-tier hosts spin down idle services, causing slow cold starts or apparent downtime when someone opens a live demo. Upkeep periodically pings each project's health endpoint, keeps services warm, and shows a single dashboard with the status of everything — no more manually checking N different host dashboards.

## Stack

- **Backend:** Supabase (Postgres, Edge Functions, Scheduled Triggers)
- **Frontend:** Next.js dashboard, deployable independently on Vercel/Netlify/etc.

## Status

Early development. See [docs/PRD.md](docs/PRD.md) for the full product spec.

## Getting Started

```bash
pnpm install
pnpm dev
```

Setup instructions (env vars, Supabase project, etc.) will be added as the backend takes shape.
