# Adding a check type

Part of Phase 11 — Extensibility & Open-Source Readiness (PRD §5.10, "Plugin-style architecture...
so new integrations don't require touching core logic", issue `#70`). Mirrors
[`../notifier/ADDING_A_CHANNEL.md`](../notifier/ADDING_A_CHANNEL.md)'s own audit for notification
channels (`#69`), applied to check types (http, tcp `#55`, dns `#56`, ssl `#57`).

## The claim, refactored to be true, then verified

Unlike `#69`'s notifier audit — where the `DISPATCHERS` registry (`#40`) already existed and only
needed verifying — this audit found the equivalent claim did **not** already hold for check types.
Before this refactor, `check.ts`'s `runHealthCheck`, `classify.ts`'s `classifyCheck`, and
`retry.ts`'s `isAttemptSuccessful` each independently branched on `project.check_type` with their
own `if`/`else if` chain. Adding a fifth check type meant editing all three.

This is now a genuine plugin registry, mirroring the notifier's `dispatch.ts`:

- [`check-types.ts`](./check-types.ts) defines the shared `CheckTypeModule` interface (`run`/
  `classify`/`isAttemptSuccessful`) and the `CHECK_TYPES: Record<CheckType, CheckTypeModule>`
  registry.
- [`http.ts`](./http.ts)/[`tcp.ts`](./tcp.ts)/[`dns.ts`](./dns.ts)/[`ssl.ts`](./ssl.ts) each
  implement all three responsibilities for their own check type.
- [`check.ts`](./check.ts)/[`classify.ts`](./classify.ts)/[`retry.ts`](./retry.ts) are now thin:
  each just looks up `CHECK_TYPES[project.check_type]` and delegates. None of them has any
  per-check-type logic left.

Adding a new check type touches only:

1. **One new module** (`supabase/functions/prober/<type>.ts`) exporting `run`/`classify`/
   `isAttemptSuccessful` functions and a `<type>CheckType: CheckTypeModule` bundling them — see
   `tcp.ts` for the simplest example (only `up`/`down`, no HTTP-specific rules).
2. **One new test file** (`<type>.test.ts`) — see [Test conventions](#test-conventions) below.
3. **Two edits to `check-types.ts`**: widen the `CheckType` union, and add one entry to
   `CHECK_TYPES`.

**Zero changes** to `check.ts`, `classify.ts`, or `retry.ts` — verified by actually adding a
`websocket` check type as a proof-of-concept (opens a WebSocket connection, `up`/`down` only) and
running the full test suite: all 199 pre-existing tests passed unchanged, plus 5 new ones. `deno
check` across every file in this directory reported zero errors with only `check-types.ts` (the
registry itself) and the two new files touched. Reverted afterward — see this issue's closing
comment for the record and reasoning (the same "half-finished, invisible in the dashboard" concern
as `#69`'s `slack` notification-channel proof-of-concept, below).

One minor, honest caveat, same as `#69`'s: **one test fixture** (not production code) needed a
one-line addition — `check-types.test.ts`'s own registry-shape assertion (a literal array of
expected keys). Expected TypeScript/test-literal friction from widening a union, not a "core
logic" change.

## What this claim does *not* cover: the dashboard

Same gap `#69` found for notification channels, applied here: a real (not proof-of-concept) new
check type also needs dashboard-side work that isn't a zero-touch registry lookup, in
`src/features/projects/`:

| File | What's needed |
| --- | --- |
| `constants/index.ts` | Add the type string to `CHECK_TYPES` — this is the check-type selector's options list in the add-project form |
| `lib/validation.ts` | A new target-format branch in `createProjectSchema`'s `superRefine` (what a valid `health_url` looks like for this type — a full URL? `host:port`? a bare hostname?) |
| `components/add-project-form.tsx` | A new case in whatever renders the type-specific `health_url` field's label/placeholder/help text |

A new check type is not usable end-to-end (configurable from the dashboard, health-check-contract-
documented) until both this module's backend half and the dashboard's half are done.

## Test conventions

Every check type's test file shares the same shape as the notifier's own dispatcher tests
(`#69`'s `ADDING_A_CHANNEL.md`) — match it for a new one:

- `@std/assert`'s `assertEquals` only.
- A local `fakeProject(overrides)` helper (a `DueProject` literal) and a local `fakeResult(overrides)`
  helper (a `CheckResult` literal) — duplicated per file, not shared/imported.
- For a check type that touches real I/O (`Deno.connect`/`Deno.resolveDns`/`fetch`/`WebSocket`),
  stub the global constructor/function manually inside a `try { ... } finally { restore } ` block
  — never a mocking library. See `tcp.test.ts`'s `withFakeConnect` or `ssl.test.ts`'s fake TLS
  wire-byte fixtures for the pattern.
- Three sections per file: `run()` (the actual check execution, against the stub), `classify()`
  (pure, no stubbing needed), `isAttemptSuccessful()` (pure, no stubbing needed).
- At minimum, cover: a successful outcome; a connection-level failure; a timeout that doesn't hang
  the test (the real timeout race, not the fake, must be what ends the test); and, for `classify`,
  every distinct `CheckStatus` your type can actually produce (most non-HTTP types are only
  `up`/`down` — don't invent `degraded`/`waking`/`unknown` cases a type can never really produce).
