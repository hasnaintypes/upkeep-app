# Adding a notification channel

Part of Phase 11 — Extensibility & Open-Source Readiness (PRD §5.10, "Plugin-style architecture
for notification channels... so new integrations don't require touching core logic", issue `#69`).
This document is the result of actually auditing that claim, not assuming it — a proof-of-concept
`slack` dispatcher was added, verified end-to-end (unit tests, a real schema migration applied
against the live database, a real Edge Function deploy), then deliberately removed. See `#69`'s
closing comment for the full record of what was verified and why it was reverted rather than kept.

## The claim, verified

Adding a new channel type to the **notifier's dispatch layer** genuinely requires touching only:

1. **One new dispatcher module** (`supabase/functions/notifier/<type>.ts`) implementing
   `ChannelDispatcher` (see [`dispatch.ts`](./dispatch.ts)'s own doc comment for the exact
   contract: never throw, don't retry internally, validate your own `config` shape).
2. **One new test file** (`<type>.test.ts`) — see [Test conventions](#test-conventions) below.
3. **Two edits to `dispatch.ts`**: add the type string to the `NotificationChannelType` union, and
   register your dispatcher in the `DISPATCHERS` map.
4. **One migration** widening `notification_channels`'s `type` check constraint (see
   [Database migration](#database-migration) below).

**Zero changes** to [`notifier.ts`](./notifier.ts)'s polling/orchestration logic, or to any
existing dispatcher (`discord.ts`/`webhook.ts`/`email.ts`) — confirmed by actually adding a
`slack.ts` dispatcher and running the full test suite: all 38 pre-existing tests passed unchanged,
plus the new dispatcher's own tests. `notifier.ts` looks up `dispatchers[channel.type]` as a plain
object-key lookup; it never branches on channel type at all, so a new key in the map is genuinely
invisible to it.

One minor, honest caveat: two **test fixtures** (not production code) needed a one-line addition
each to satisfy the widened `NotificationChannelType` union — `dispatch.test.ts`'s own registry
shape assertion, and `notifier.test.ts`'s `fakeDispatchers()` helper (a `Record<NotificationChannelType,
ChannelDispatcher>` literal). This is expected TypeScript exhaustiveness friction from widening a
union type, not evidence of a "core logic" change — but worth stating plainly rather than only
counting production files.

## What this claim does *not* cover: the dashboard

The plugin-architecture claim, as written in the PRD and in `dispatch.ts`'s own comments, is
scoped specifically to the **notifier's own orchestration logic** — it says nothing about the
Next.js dashboard's channel-creation UI, and that side is *not* a zero-touch registry lookup today.
A real (not proof-of-concept) new channel type also needs, in `src/features/notifications/`:

| File | What's needed |
| --- | --- |
| `types/index.ts` | Add the type literal to `NotificationChannelType`, and a new `<Type>ChannelConfig` member to the `NotificationChannelConfig` union |
| `constants/index.ts` | Add `{ value: "<type>", label: "..." }` to `NOTIFICATION_CHANNEL_TYPES` — this is literally the channel-creation dropdown's options list |
| `lib/validation.ts` | A new Zod config schema, and a new arm in `createChannelSchema`'s discriminated union |
| `components/add-channel-form.tsx` | A new entry in the `Record<NotificationChannelType, {...}>` config-field map (label/placeholder/input type for the one config field the form shows) |
| `lib/actions.ts` | **Genuinely branches on type** (a ternary chain in `validateChannelConfig`, not a lookup) — must add a branch here, or a new type's config silently gets validated against the wrong (`webhook`) schema |
| `lib/config-mask.ts` | **Genuinely branches on type** (a `switch` in `describeChannelConfig`) — must add a `case` here, or the channel-list card shows "Not configured" for the new type |

Two of those six are real conditionals, not registry lookups, unlike the notifier's own dispatch
layer. A new channel type is not usable end-to-end (creatable from the dashboard, displayed
correctly) until both layers are done — this doc's scope is the notifier half; treat the dashboard
half as an equally-required companion change, not an afterthought.

## Test conventions

Every existing dispatcher test file (`discord.test.ts`, `webhook.test.ts`, `email.test.ts`) shares
the same shape — match it for a new one:

- `@std/assert`'s `assertEquals` only — no other assertion library.
- Local `fakeChannel(overrides)`/`fakeOpenEvent(overrides)`/`fakeResolvedEvent(overrides)` helpers
  (duplicated per file, not shared/imported — matches this codebase's existing per-file test
  fixture convention).
- Stub `globalThis.fetch` manually inside `try { ... } finally { globalThis.fetch = originalFetch; }`
  — never a mocking library.
- Two sections: first test the pure payload-builder function in isolation (exported specifically
  for this), then test the actual dispatcher against the stubbed `fetch`.
- Standard cases every dispatcher's tests cover: invalid/missing config → `ok:false` and `fetch`
  never called; a successful call → `ok:true`, assert on the captured URL/method/headers/body; a
  non-2xx response → `ok:false`, error includes the status; `fetch` throwing → `ok:false`, never
  re-thrown.

## Database migration

Postgres has no `ALTER CONSTRAINT ... SET EXPRESSION` — widening the allowed `type` values means
dropping and recreating the check constraint under its **original name**, not adding a new one
(see the `remove_telegram_channel_type` migration for the precedent this follows in reverse):

```sql
alter table public.notification_channels
  drop constraint notification_channels_type_valid;

alter table public.notification_channels
  add constraint notification_channels_type_valid check (
    type in ('discord', 'email', 'webhook', '<new_type>')
  );
```

Create it with `pnpm supabase migration new add_<type>_channel_type`, not by hand-editing an
existing migration file.
