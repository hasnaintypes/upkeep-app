# AGENTS.md

## What this is

Upkeep — self-hosted uptime/health monitor for personal projects on free-tier hosts. The Next.js frontend (marketing site, Supabase auth, project management) is built; the prober backend (Supabase Edge Functions under `supabase/functions/`) is in progress, dashboard/notification features are not built yet. Full product spec: `docs/PRD.md` — **gitignored, local-only** (won't exist on a fresh clone; read it if present before building backend features).

## Commands

```bash
pnpm dev      # dev server
pnpm build    # production build (also type-checks)
pnpm start    # run production build
pnpm lint     # eslint
```

No test suite exists for the Next.js app yet. `supabase/functions/<name>/` modules do have Deno
unit tests (e.g. `prober/classify.test.ts`, `prober/persist.test.ts`) — see the Edge Functions
section below for how to run them.

**Run `pnpm lint` before `pnpm build`, or delete `.next/` first.** `eslint.config.mjs` has no ignore patterns, so a stale `.next/` build directory gets linted too and floods the output with hundreds of unrelated errors from bundled/minified JS.

### Database (Supabase CLI)

Schema is code, not dashboard-authored: `supabase/migrations/` is the source of truth. The CLI is
pinned as a `devDependency` — always invoke it via `pnpm supabase ...`, never a global install, so
every contributor uses the same version. This project targets the hosted Supabase project directly
(no local Docker stack).

```bash
pnpm supabase link --project-ref <ref>   # connect to the hosted project (after `pnpm supabase login`)
pnpm supabase migration new <name>       # create a new migration (pattern for every schema change)
pnpm supabase db push --dry-run          # preview which migrations would apply
pnpm supabase db push                    # apply committed migrations to the linked project
```

No Supabase secrets are ever committed — `supabase login` stores its token in the CLI's global
config outside the repo.

**Regenerate `src/lib/supabase/types.ts` after every migration change**: `pnpm gen:types` (runs
`supabase gen types typescript --linked`, so it reads from the linked hosted project, not a local
one). Commit the regenerated file in the same change as the migration. `createClient()` in
`client.ts`/`server.ts` is generic over the resulting `Database` type — don't hand-edit `types.ts`.

**Verifying SQL directly** (no local Docker/Postgres to test against): `pnpm supabase db query
--linked "<sql>"` or `--file <path>` runs against the real linked database via the Management API.
Useful for `EXPLAIN`, checking a new function's query plan, or inserting/deleting throwaway rows to
exercise a migration — always clean up any rows you insert this way afterward.

### Edge Functions (Supabase CLI)

`supabase/functions/<name>/` — Deno runtime, scaffolded with `pnpm supabase functions new <name>`
(don't hand-create the folder; the CLI also wires up `[functions.<name>]` in `config.toml`). Uses
the `withSupabase` helper from `@supabase/server` for auth — pick the narrowest `auth` mode for the
caller (`"secret"` for cron/service-to-service calls with no user session, `"user"` for calls
carrying a real session JWT; see a given function's module comment for which and why).

Same hosted-only workflow as the database — no `supabase start`/local Docker stack:

```bash
pnpm supabase functions deploy <name> --use-api   # bundles server-side, no Docker required
```

The Deno CLI (installed separately, e.g. `npm install -g deno` — not a project dependency) runs
each function's own tests and type-checks directly against its `deno.json` import map, with no
Docker/local Supabase stack needed:

```bash
deno test           # from inside supabase/functions/<name>/
deno check *.ts      # type-checks against Deno-style specifiers next build can't resolve
```

Commit the `deno.lock` this generates per function, same reasoning as `pnpm-lock.yaml`.

Manually invoking a deployed function needs a **secret key** (Dashboard → Settings → API Keys →
Secret keys), not the legacy `service_role` JWT — `auth: "secret"` validates against that newer key
type specifically. If the project only has legacy keys, generate a secret key there first. Store it
as `SUPABASE_SECRET_KEY` (see `.env.example`) — the same value other server-side callers use to
invoke `auth: "secret"` functions, e.g. the "run check now" Server Action
(`src/features/projects/lib/run-check.ts`) or a `pg_cron` trigger.

## Architecture

Feature-based `src/` layout. Path alias `@/*` → `./src/*` (not repo root).

- `src/app/` — routes only (pages, layouts, route handlers). `src/app/auth/*` are auth pages; `src/app/dashboard/*` requires a session (enforced by `src/proxy.ts`).
- `src/features/<name>/` — self-contained modules (currently `auth`, `marketing`, `projects`, `dashboard`), each split into `components/`, `lib/`, `constants/`, `types/`, with a single `index.ts` barrel as its public API. Import via `@/features/auth`, never reach into internal paths like `@/features/auth/components/login-form`. Follow this pattern for new features; only add `lib`/`hooks`/`constants` subfolders when there's real content for them.
- `src/components/ui/*` — shadcn/ui primitives (style "new-york", managed via `components.json`, add new ones with the shadcn CLI). `src/components/layout/*` — cross-feature app chrome (header/footer/theme switcher) only; feature-specific UI belongs in its feature folder, not here.
- `src/hooks/` — shadcn-CLI-managed hooks shared across `components/ui/*` (e.g. `use-mobile.ts`, added by the `sidebar` component). Feature-specific hooks still belong in that feature's own `lib/` or `hooks/` subfolder, not here.
- `src/lib/supabase/` — four separate client constructors for four different execution contexts: `client.ts` (browser), `server.ts` (Server Components/Actions, cookie-based, RLS as the signed-in user), `proxy.ts` (middleware session refresh), `service.ts` (service-role, bypasses RLS entirely — `import "server-only"` guarded, only for trusted server code with no user session, e.g. `POST /api/projects/register`). Don't reuse one across contexts, and don't cache instances in module-level globals (Fluid Compute — see comments in those files).
- `src/app/api/` — route handlers for programmatic (non-browser) callers, e.g. `POST /api/projects/register`. Keep the auth check and response shaping in the route file; put the actual business logic in the relevant `src/features/<name>/lib/*.ts` module (not inline, and not in a `"use server"` actions file — see that route's module comment for why).
- `src/proxy.ts` is this project's Next.js middleware (exports `proxy`, not `middleware` — current Next.js convention for this version).

## Auth

- Supabase Auth via `@supabase/ssr`. All client-side auth calls (sign in/up/out, password reset) live in `src/features/auth/lib/actions.ts`, each returning `AuthActionResult`. Keep UI components free of direct `supabase.auth.*` calls — add new auth logic there instead.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). If unset, `hasEnvVars` (`src/lib/utils.ts`) is false and `src/lib/supabase/proxy.ts` no-ops the auth gate — the app still runs without Supabase configured.

## Styling

- Tailwind CSS v4, CSS-first config — **no `tailwind.config.ts`** (deleted deliberately; don't recreate it). Theme tokens (OKLCH) live in the `@theme inline` block in `src/app/globals.css`. `components.json` has `"config": ""`.
- Fonts: Geist Sans + Geist Mono via `next/font/google` in `src/app/layout.tsx`, wired as CSS variables (`--font-geist-sans` / `--font-geist-mono`) referenced from the `@theme` block. Apply via `.variable` + Tailwind's `font-sans`/`font-mono` utilities — don't switch back to `.className`.
- `framer-motion` is pinned at exact version `13.1.1` (no caret) — don't let a routine `pnpm update` silently bump it.
- Animation utility classes (`animate-in`, `fade-in-0`, `zoom-in-95`, etc., used by `components/ui/dropdown-menu.tsx`) come from `tw-animate-css`, the Tailwind v4 equivalent of `tailwindcss-animate` (v3-only, don't reinstall it).

## Gotchas

- `next.config.ts` sets `cacheComponents: true`. Any dynamic data access (`cookies()`, `supabase.auth.getClaims()`, etc.) must be isolated in its own component wrapped in `<Suspense>`, or `pnpm build` fails with a "blocking prerender" error. Pattern: see `src/app/dashboard/page.tsx` — the page component itself stays synchronous; a separate `async function AuthGuard()` does the session check and is rendered inside `<Suspense>`.
- `tsconfig.json` excludes only `node_modules` and `supabase/functions`. Any stray Next.js/TS project left in the repo root (e.g. a copied design template) still gets type-checked by `pnpm build` and breaks it — keep unrelated scaffolding out of the repo root, or delete it once you've extracted what you need from it.
- `supabase/functions/**` is Deno, not Node — it has its own `deno.json` import map per function and is excluded from the root `tsconfig.json` (added when the first function was created) specifically because `next build`'s type-checker can't resolve Deno-style specifiers like `@supabase/server`. If you ever see `next build` failing on a `supabase/functions/*.ts` file with "Cannot find module," the exclude is missing, not the package.

## Working Conventions

- **Never add a `Co-Authored-By` trailer or "Generated with Claude" footer to commit messages.** Plain, human-style messages only, following Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`) with a short imperative subject.
- **Act as a software architect.** Before implementing, weigh future scalability (more projects/users/checks), the PRD's Supabase-portability requirement, and fit with the existing feature-based module pattern. Choose the boring, extensible option over a clever one-off.
- **Don't silently fix unrelated issues.** If you notice a bug, bad convention, or debt outside the current task's scope, stop and tell the user what it is and why it matters instead of patching it inline. The user decides whether it becomes a GitHub issue (see `docs/ROADMAP.md` for phase/issue structure).
- **Production-grade only.** No dangling TODOs, no swallowed errors, no `any` used to dodge a type error. Handle errors at their actual boundary.
- **Be token-efficient.** Don't over-narrate, don't re-read files you just edited. For a single non-decomposable task, do the work then verify once (lint/typecheck/build) at the end — don't re-verify after every intermediate edit.
- **Nothing server-only ever reaches the client.** Only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public. Service role keys, API secrets, and notification tokens stay server-only (Server Actions, Route Handlers, Edge Functions) — never pass them into a Client Component, serialize them into HTML, or log them.
- **Keep `CLAUDE.md`/`AGENTS.md` and `README.md` current.** Architecture, convention, command, or env var changes get documented in the same change that makes them — don't let docs drift.
