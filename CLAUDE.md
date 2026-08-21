# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Upkeep — a self-hosted uptime/health monitor for personal projects on free-tier hosts. The product spec lives in `docs/PRD.md` (gitignored, local-only — read it for feature scope and data model before building backend features). Currently only the Next.js frontend (marketing site + Supabase auth) exists; the prober/dashboard/notification backend described in the PRD has not been built yet.

## Commands

```bash
pnpm dev      # start dev server
pnpm build    # production build
pnpm start    # run production build
pnpm lint     # eslint
```

No test suite exists yet.

## Architecture

Next.js 15 App Router project using a **feature-based `src/` layout**:

- `src/app/` — routes only (pages, layouts, route handlers). Auth routes live under `src/app/auth/*`; a `src/app/protected/` route group requires an authenticated session.
- `src/features/<feature>/` — self-contained feature modules (currently `auth` and `marketing`), each internally split into `components/`, `lib/`, `constants/`, `types/`. Every feature exposes a single `index.ts` barrel as its public API — import from `@/features/auth`, not from internal paths like `@/features/auth/components/login-form`. Follow this pattern for new features.
- `src/components/` — cross-feature UI: `components/ui/*` is shadcn/ui primitives (managed via `components.json`, style "new-york"), `components/layout/*` is app chrome (header/footer/theme switcher).
- `src/lib/supabase/` — three separate Supabase client constructors, each for a different execution context: `client.ts` (browser), `server.ts` (Server Components/Actions, cookie-based), `proxy.ts` (middleware session refresh, used by `src/proxy.ts`). Don't reuse one across contexts — Supabase SSR requires the right client per context, and instances must not be cached in module-level globals (see comments in those files re: Fluid Compute).
- `src/proxy.ts` is this project's Next.js middleware (exports `proxy`, not `middleware`, per the current Next.js convention) — it refreshes the Supabase session and redirects unauthenticated users to `/auth/login` for any route outside `/`, `/login`, `/auth`.

Path alias: `@/*` → `./src/*`.

## Auth

Supabase Auth via `@supabase/ssr`. Client-side auth actions (sign in/up/out, password reset) are centralized in `src/features/auth/lib/actions.ts`, each wrapping a single Supabase call and returning `AuthActionResult` — keep UI components free of direct Supabase calls and add new auth actions there.

Env vars (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `src/lib/supabase/proxy.ts` no-ops the session check if these aren't set (`hasEnvVars`), so the app still runs without Supabase configured.

## Notes

- Styling: Tailwind CSS v4 (via `@tailwindcss/postcss`, no `tailwind.config.ts`), dark/light theme via `next-themes`.

## Working Conventions

- **Commit messages: never add a `Co-Authored-By` trailer or any "Generated with Claude" footer.** Plain, human-style commit messages only. Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`) with a short imperative subject line.
- **Think like a software architect, not just an implementer.** Before building a feature, consider how it scales (more projects, more users, more checks per minute), how it stays decoupled from Supabase specifics per the PRD's portability requirement, and whether it fits the existing feature-based module pattern. Prefer the boring, extensible option over a clever one-off.
- **Don't fix unrelated problems inline.** If you spot a bug, bad convention, or tech debt in code you're not currently tasked with changing, stop and flag it to the user (what it is, why it matters, suggested severity) instead of silently patching it. Let the user decide whether it becomes a GitHub issue and when it gets scheduled — see `docs/ROADMAP.md` for how phases/issues are structured.
- **Production-grade code only.** No TODO-and-move-on, no silent `catch {}`, no `any` escape hatches to dodge a type error. Handle errors at the boundary they occur, not everywhere defensively.
- **Be token-efficient.** Don't narrate work verbosely or re-read files you just edited. If a task is a single, non-decomposable unit of work, do it, then verify once — don't run `pnpm lint`/`pnpm build`/typecheck after every intermediate edit. Only verify after a task (or a clearly-scoped subtask) is actually complete.
- **No secrets or server-only data reach the client.** Never expose a secret via a `NEXT_PUBLIC_*` env var. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are meant to be public — anything else (service role keys, API secrets, notification channel tokens) stays server-only (Server Actions, Route Handlers, Edge Functions) and must never be passed into a Client Component's props, serialized into HTML, or logged. Double-check this whenever touching `src/lib/supabase/*`, Server Actions, or anything under `src/features/*/lib/`.
- **Keep this file and `README.md` current.** When you change architecture, conventions, commands, or env vars, update `CLAUDE.md` (and `AGENTS.md`) and `README.md` in the same change — don't let docs drift from the code.
