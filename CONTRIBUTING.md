# Contributing to Upkeep

Thanks for considering a contribution. This is a small, self-hosted project — contributions of any
size (a typo fix, a bug report, a new feature) are welcome.

## Local development setup

See the [README's "Self-hosting" section](README.md#self-hosting) for the full walkthrough
(prerequisites, `pnpm setup`, environment variables, verifying it's working). The short version:

```bash
pnpm install
pnpm supabase login
pnpm setup
pnpm dev
```

Before opening a PR:

```bash
pnpm lint
pnpm build
```

Run `pnpm lint` before `pnpm build`, or delete `.next/` first — a stale build directory gets linted
too and floods the output with unrelated errors.

## Project structure and conventions

The full set of conventions this codebase follows lives in [`AGENTS.md`](AGENTS.md) — read it
before making non-trivial changes. The essentials:

- **Feature-based `src/` layout.** `src/app/` is routes only (pages, layouts, route handlers).
  `src/features/<name>/` is a self-contained module (`components/`, `lib/`, `constants/`, `types/`),
  exposing a single `index.ts` barrel as its public API — import via `@/features/auth`, never reach
  into internal paths like `@/features/auth/components/login-form`.
- **Database schema is code, not dashboard-authored.** `supabase/migrations/` is the source of
  truth — every schema change is a new migration (`pnpm supabase migration new <name>`), never a
  hand-edited existing one and never a change made directly in the Supabase dashboard.
  Regenerate `src/lib/supabase/types.ts` (`pnpm gen:types`) in the same change as any migration.
- **Edge Functions are Deno, not Node.** `supabase/functions/<name>/` each has its own `deno.json`
  import map and test suite (`deno test` / `deno check *.ts`, run from inside that function's own
  directory) — they're excluded from the root `tsconfig.json` on purpose.
- **Act like an architect, not just an implementer.** Before building something, consider how it
  scales, whether it fits the existing feature-based pattern, and whether it stays portable per the
  project's own Supabase-specific-but-swappable design. Prefer the boring, extensible option over a
  clever one-off.
- **Production-grade only.** No dangling TODOs, no swallowed errors (`catch {}` with nothing in
  it), no `any` used to dodge a type error. Handle errors at the boundary where they actually occur.
- **Nothing server-only ever reaches the client.** Only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are meant to be public. Service-role keys, API secrets, and
  notification-channel tokens (webhook URLs, API keys) stay server-only — never in a Client
  Component's props, never serialized into HTML, never logged.
- **Don't silently fix unrelated issues.** If you notice a bug or convention problem outside the
  scope of what you're working on, mention it in your PR description instead of folding an
  unrelated fix into the same diff — makes review easier and keeps changes reviewable in isolation.

> **Note for contributors**: `AGENTS.md` is the actively-maintained source of truth for these
> conventions. A `CLAUDE.md` also exists in this repo (predates `AGENTS.md`) but has drifted out of
> date relative to the current codebase — don't rely on it; a fix/consolidation is tracked
> separately.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`,
`chore:`, `docs:`, `test:`, followed by a short, imperative subject line (`feat(prober): add DNS
check type`, not `Added DNS check type` or `feat: Added support for DNS...`).

Plain, human-style commit messages only — please don't include a `Co-Authored-By` trailer or a
"Generated with \<AI tool>" footer, regardless of what wrote the diff.

## Opening an issue

- **Bug reports**: what you expected, what actually happened, and how to reproduce it (your
  `check_type`/config if it's check/notification related, since behavior is often config-dependent).
- **Feature requests**: what you're trying to accomplish, not just the feature itself — there may
  already be a way to do it, or a reason it was deliberately left out (search closed issues first;
  several features here were explicitly descoped with a documented reason, e.g. Telegram support).

## Opening a PR

- Keep it scoped to one thing — a bug fix, one feature, one refactor. Split unrelated changes into
  separate PRs.
- If your change touches the database schema, include the migration and the regenerated
  `src/lib/supabase/types.ts` in the same PR.
- If your change touches an Edge Function, make sure `deno test`/`deno check *.ts` pass from inside
  that function's own directory, and include a new/updated test file if you added behavior.
- Run `pnpm lint` and `pnpm build` locally before opening — CI (if configured) will catch it
  anyway, but it's faster for everyone if it's already clean.
- Describe *why*, not just *what*, in the PR description — especially for anything that isn't a
  purely mechanical change.

## License

By contributing, you agree that your contributions will be licensed under this project's
[MIT License](LICENSE).
