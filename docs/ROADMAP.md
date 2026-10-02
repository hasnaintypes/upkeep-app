# Upkeep Roadmap

Source of truth: `docs/PRD.md`. This roadmap breaks the full feature surface from the PRD into
sequential, buildable phases. Each phase is scoped so that:

- It only depends on phases before it (no forward dependencies).
- It ships something independently verifiable (schema, working endpoint, working UI flow, etc.),
  not just partial plumbing.
- Every task is small enough to become a single GitHub issue with a clear "done" state.

## How to use this file

1. Each **Phase** becomes a GitHub milestone.
2. Each **Task** under a phase becomes one GitHub issue. Task titles are written so they can be
   copy-pasted as issue titles directly (e.g. "Create `projects` table + migration").
3. **Before starting a phase's tasks**, its *Readiness Checklist* must be fully checked off. This
   is the "make sure everything is perfect before we start working on the actual feature" gate —
   don't open/start implementation issues for a phase until the checklist for that phase is green.
4. **Exit Criteria** define when a phase is actually done — used to close the milestone.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundation (in progress)

**Goal:** Auth, project shell, and base UI kit exist so every later phase has somewhere to attach
routes and components.

### Readiness Checklist
- [x] Next.js 15 App Router project scaffolded with feature-based `src/` layout.
- [x] Supabase Auth wired (`@supabase/ssr`, sign in/up/out, password reset).
- [x] `src/proxy.ts` middleware protecting non-public routes.
- [x] shadcn/ui primitives installed (`components.json`, style "new-york").
- [x] Tailwind v4 + dark/light theme via `next-themes`.
- [x] `.env.example` documents all required Supabase env vars.
- [x] `pnpm lint` and `pnpm build` both pass clean on `master`.

### Tasks
- [x] Confirm `.env.example` is current and matches `src/lib/supabase/*` env var usage.
- [x] Remove/finish any leftover marketing-page churn from the current diff (`src/app/page.tsx`,
      `src/features/marketing/*`) so `master` is in a clean, deployable state.
- [x] Add root `README.md` section describing local dev setup (`pnpm dev`, env vars, Supabase
      project requirements) — this is also a prerequisite for Phase 9 open-source readiness.

### Exit Criteria
Clean `pnpm build`, working auth flow end-to-end (sign up → confirm → sign in → protected route),
no stray/incomplete marketing scaffolding left uncommitted.

---

## Phase 1 — Data Layer & Supabase Schema

**Goal:** Every table in the PRD's data model exists in Supabase with RLS, migrations are
reproducible, and the app can talk to the DB from server code.

### Readiness Checklist
- [ ] Supabase project provisioned (or confirmed reused) for this app, separate from any other
      project's data.
- [ ] Decision made & recorded: Supabase CLI local migrations vs. dashboard-authored schema (must
      be reproducible — PRD 5.9/9 requires portability, so migrations-as-code is required, not
      optional).
- [ ] Naming/branding conventions confirmed (PRD open question) so table/schema comments and any
      public-facing strings don't need renaming later.
- [ ] Confirm single-user-first approach: RLS scoped to `auth.uid()` ownership from day one (PRD
      5.7) even though only one user exists initially.

### Tasks
- [ ] Set up Supabase CLI + local migration workflow (`supabase/migrations/`).
- [ ] Migration: `projects` table (per PRD §6 schema) + RLS policy (owner-only access).
- [ ] Migration: `checks` table + RLS policy + index on `(project_id, checked_at)`.
- [ ] Migration: `incidents` table + RLS policy.
- [ ] Migration: `checks_aggregated` table + RLS policy.
- [ ] Migration: `notification_channels` table + RLS policy.
- [ ] Migration: `project_notification_rules` table + RLS policy.
- [ ] Seed script / fixture data for local dev (a few fake projects + checks).
- [ ] `src/lib/supabase/` typed query helpers or generated types (`supabase gen types typescript`)
      wired into the build.

### Exit Criteria
`supabase db reset` (or equivalent) reproduces the full schema from migrations alone; a signed-in
user can only read/write their own rows (verified with a second test user); generated TS types
compile against the schema.

---

## Phase 2 — Project Registration & Management

**Goal:** A user can add, edit, deactivate, delete, and organize the projects they want monitored.
This is the first user-facing feature built on Phase 1's schema.

### Readiness Checklist
- [ ] Phase 1 exit criteria met (schema + RLS verified).
- [ ] UX decision made: single "add project" form vs. multi-step wizard (custom headers, interval,
      tags are all optional/advanced — decide what's above vs. below the fold before building).
- [ ] Decide validation rules for `health_url` (must be HTTPS? localhost allowed in dev only?)
      before writing the form, not after.

### Tasks
- [ ] `src/features/projects/` module scaffold (`components/`, `lib/`, `constants/`, `types/`,
      `index.ts` barrel) matching the `auth`/`marketing` feature pattern.
- [ ] Server actions: create/update/deactivate/delete project (mirrors
      `src/features/auth/lib/actions.ts` pattern, returns a typed result).
- [ ] "Add project" form: name, description, health URL, method, expected status, interval,
      timeout, tags, hosting provider.
- [ ] Project list view (table/cards) with edit/deactivate/delete actions.
- [ ] Custom headers / bearer token field (stored in `headers` jsonb, masked in UI).
- [ ] Collections/folders grouping (e.g. "Resume Projects," "Side Projects").
- [ ] Bulk import via JSON/CSV upload.
- [x] Programmatic registration API route (`POST /api/projects/register`) authenticated via API
      key (depends on Phase 6 API key generation — stub with a temporary shared-secret header if
      sequencing requires it, but flag as tech debt). Done in #47: wired to real per-user
      `api_keys` (SHA-256 hash lookup via `verifyApiKey`, service-role, no session) — the
      `UPKEEP_REGISTRATION_SECRET`/`UPKEEP_REGISTRATION_OWNER_USER_ID` stub is fully removed.
      Also fixed a pre-existing bug found while verifying this end-to-end: `src/proxy.ts`'s
      middleware redirected every unauthenticated `/api/*` request to `/auth/login` before it ever
      reached the route handler (confirmed via a live 307), regardless of which credential it
      carried — `/api` is now excluded from that session-redirect check
      (`src/lib/supabase/proxy.ts`).

### Exit Criteria
A user can fully manage their project list through the UI with no direct DB access required; RLS
confirmed to prevent cross-user visibility of projects.

---

## Phase 3 — Health Check Engine (Prober)

**Goal:** Registered projects actually get pinged on schedule and results land in `checks`. This
is the core value proposition of the product — nothing after this phase matters if this doesn't
work reliably.

### Readiness Checklist
- [x] Phase 1 (`checks` table) and Phase 2 (real project data to check) both done.
- [x] Decide prober runtime up front: Supabase Edge Function + `pg_cron`/Scheduled Trigger per the
      PRD's architecture diagram — confirm this is still the intended approach (vs. an external
      cron worker) before writing code, since it changes the deployment story. **Decided (#20):**
      confirmed Edge Function + Scheduled Trigger, matching the PRD's architecture diagram.
- [x] Decide status-classification thresholds (what response time counts as "degraded" vs.
      "waking") — write these down, don't invent them ad hoc while coding. **Decided (#24):** fixed
      (not per-project-relative) response-time thresholds on an otherwise-successful check
      (`http_status === expected_status`, no error, not timed out): `<= 3000ms` → `up`,
      `3000–7000ms` → `degraded`, `> 7000ms` → `waking`. A `timed_out` result (exceeded the
      project's own generous `timeout_ms`) or an `http_status` that doesn't match
      `expected_status` is `down`; a check that never got an HTTP response at all due to a
      execution-level error (DNS failure, connection refused, TLS error, etc., anything other than
      our own timeout abort) is `unknown`. See `supabase/functions/prober/classify.ts`.
- [x] Confirm free-tier limits (Edge Function invocation count, execution time) won't be exceeded
      at the planned tick interval and expected project count. **Decided (#26):** 1-minute base
      tick, matching the PRD §7 architecture diagram's example exactly. Free tier includes 500,000
      Edge Function invocations/month (supabase.com/pricing); a 1-minute tick is 60 × 24 × 30 =
      43,200 invocations/month, ~8.6% of that quota — comfortable headroom even before accounting
      for per-project `check_interval_seconds` meaning most ticks find nothing due at the PRD's
      expected scale (~50 projects).

### Tasks
- [x] Edge Function `prober`: load due projects (interval-based due check against `checks_aggregated`
      or a `last_checked_at` column).
- [x] HTTP GET/POST check execution with configurable method/headers/body per project.
- [x] Per-project timeout enforcement.
- [x] Retry logic (configurable retry count, short delay) before marking `down`.
- [x] Status classification logic: `up` / `down` / `degraded` / `waking` / `unknown`.
- [x] Write result row to `checks` (status, http_status, response_time_ms, error_message,
      response_snippet on failure).
- [x] Scheduled Trigger / `pg_cron` job firing the `prober` Edge Function on a fixed base tick.
- [x] Self-monitoring: record prober's own "last successful run" timestamp somewhere the dashboard
      can read (PRD §8 observability requirement).
- [x] Manual "run check now" trigger from the UI for a single project (useful for testing/demo).

### Exit Criteria
A real registered project gets a new `checks` row within one tick of its configured interval,
status classification is correct for a simulated `up`/`down`/`timeout` case, and the "last
successful prober run" timestamp updates on schedule.

---

## Phase 4 — Dashboard & Visualization

**Goal:** The data being collected in Phase 3 is actually visible and useful.

### Readiness Checklist
- [ ] Phase 3 producing real `checks` data for at least one project for a meaningful stretch of
      time (enough to render a non-trivial graph/heatmap).
- [x] Decide charting library before building (keep bundle size and Tailwind v4 compatibility in
      mind — don't default to the first library found mid-task). **Decided (#30):** shadcn's
      `chart` component (Recharts under the hood) — already the CLI/design-system pairing this
      project uses for everything else, ships its own light/dark CSS-variable theming, and adding
      it only pulls in `recharts` itself (no extra chart-adjacent dependencies needed since the
      overview table already covers tabular data without `@tanstack/react-table`).

### Tasks
- [x] Overview page: all projects, color-coded status, last-checked timestamp, rolling uptime %
      (24h/7d/30d/90d).
- [x] Per-project detail page: response-time graph over time.
- [x] Per-project detail page: uptime heatmap/timeline (status-page.io style).
- [x] Per-project detail page: raw check log (paginated table).
- [x] Filter/search/group by tag, hosting provider, status on the overview page.
- [ ] Mobile-responsive pass on overview + detail pages.

### Exit Criteria
Dashboard overview loads under 1s with realistic seeded data (PRD §9 success metric), and a
project's full history is browsable without querying Supabase directly.

---

## Phase 5 — Incident Management

**Goal:** Raw failed checks become meaningful, groupable incidents instead of noise.

### Readiness Checklist
- [x] Phase 3 (checks) and Phase 1 (`incidents` table) done.
- [x] Decide escalation threshold defaults (N consecutive failures to open, M consecutive
      successes to auto-resolve) before building — this is product behavior, not an implementation
      detail to invent while coding. **Decided (#35):** `N = 2` consecutive `down`/`degraded`
      checks opens an incident — a single blip doesn't count (PRD §5.4's "suppress noise from
      single transient blips"), but waiting for a 3rd+ would push MTTD past PRD §9's "under 2x the
      configured check interval" target. Only `down`/`degraded` count toward the streak (per the
      PRD's own wording) — a `waking` check is a genuinely successful response and an `unknown`
      check couldn't be classified as a real failure at all (see classify.ts), so either one breaks
      an in-progress streak instead of extending it. `M = 2` consecutive `up` checks auto-resolves,
      for the same single-blip-noise reasoning, symmetric with (but independent of) `N` —
      `waking` doesn't count as full recovery either, since it's still a slow response, not a
      fully-stabilized one. **Decided (#36):** the incident's `resolved_at` is set to the *Mth*
      consecutive `up` check's own `checked_at` (when recovery was actually confirmed), not the
      first successful check after the failure. See `supabase/functions/prober/incidents.ts`.

### Tasks
- [x] Incident auto-detection: group consecutive `down`/`degraded` checks into an `incidents` row.
- [x] Auto-resolve incident after M consecutive `up` checks.
- [x] Manual incident annotation (notes field, editable). **Note (#37):** no
      separate notes column -- reuses `incidents.cause` (PRD's own schema
      comment: "nullable, auto or manually annotated"), editable via
      `updateIncidentCause` (features/dashboard/lib/actions.ts) on the RLS
      policy already created for this in Phase 1 (`incidents_update_own`).
      Shipped with a deliberately minimal, unpaginated incident list on the
      per-project detail page (`IncidentsList`) so the note editor has
      something to attach to before #38 builds the real history view.
- [x] Per-project incident history view. **Note (#38):** `IncidentsList`
      replaced with `IncidentHistoryTable` (features/dashboard/components) --
      a real keyset-paginated table (`getProjectIncidentsPage`, same
      cursor-on-indexed-column pattern as #32's `CheckLogTable`/
      `getProjectChecksPage`), open vs. resolved incidents distinguished by
      badge, duration computed for both (live-ticking for open incidents,
      fixed for resolved), and the #37 note editor preserved per-row. RLS
      scoping unchanged (`incidents_select_own`, Phase 1).
- [x] Global incident history view (across all projects). **Note (#39):**
      `GlobalIncidentTable` + `IncidentFilterBar` on a new `/dashboard/incidents`
      route (`getIncidentsPage`) -- same keyset-on-`started_at` pagination as
      #38, but no `project_id` predicate (RLS's own correlated `exists()`
      against `projects` scopes it across every one of the caller's
      projects at once); added a dedicated `incidents_started_at_idx
      (started_at desc)` since the per-project composite index doesn't
      serve an unfiltered global scan/sort well. Project/status/time-range
      filters are real SQL predicates (not in-memory like the overview
      page's #33 `filterOverviewRows`), applied via single-select `Select`s
      (not toggle chips -- each facet is naturally one-at-a-time here).
      Uses `getProjects()` (every project, not just active) since the
      issue's own AC says "every project the signed-in user owns." Row
      rendering (status/duration/note editor) is shared with #38 via the
      extracted `IncidentRow` component, given an extra `project` prop for
      the "which project" column/link.

### Exit Criteria
A simulated outage (project made to fail on purpose) produces exactly one incident record with
correct start/end times, not N disconnected failed-check rows.

---

## Phase 6 — Alerting & Notifications

**Goal:** The user finds out about incidents without watching the dashboard.

### Readiness Checklist
- [x] Phase 5 (incidents) done — alerts key off incident state changes, not raw checks.
- [x] Decide v1 notification channel (PRD open question — Discord recommended for webhook
      simplicity). Don't build multiple channels in parallel before one works end-to-end.
      **Decided (#41):** Discord, per the PRD's own §10 recommendation — implemented and verified
      against a real Discord webhook (both open and resolve embeds, plus a real revoked-webhook
      404 gracefully handled) before #42-44 begin.
- [ ] API key generation strategy decided (needed for Phase 2's programmatic registration too —
      revisit that stub task once this lands). Unrelated to #40 (which uses the existing
      SUPABASE_SECRET_KEY service-to-service auth, already established by the prober).

### Tasks
- [x] `notifier` Edge Function: fires on incident open/resolve. **Note (#40):** a scheduled
      `pg_cron` poll of `incidents` (own 1-minute tick, `schedule_notifier_cron` migration) for
      un-notified open/resolve transitions, not a fire-and-forget call from the prober's own
      request lifecycle — decouples notifier failures/latency from the prober's critical path and
      gets retries for free (`incidents.notified`/`resolved_notified` flags stay false until a
      dispatch attempt runs, see `supabase/functions/notifier/notifier.ts`'s own module comment for
      the full reasoning). Defined the plugin-style `ChannelDispatcher` contract (`dispatch.ts`) —
      #41-44 each replace their own stub entry in `DISPATCHERS`, no changes needed to `notifier.ts`
      itself. Added two migrations: `project_notification_rules.is_muted` (no mute mechanism
      existed at all despite PRD §5.5/Phase 6 exit criteria requiring one) and
      `incidents.resolved_notified` (the existing `notified` column can only track one of the two
      independently-notifiable transitions). `escalation_threshold` is compared against the
      prober's own fixed incident-open threshold (2) as a v1 scope decision — a rule configured
      above that will never fire on open, since there's no mechanism yet to track a failure streak
      longer than the incident's own opening threshold; flagged as a known limitation, not silently
      dropped. Verified end-to-end against the live hosted DB with real throwaway seed data (open
      dispatch, resolve dispatch, idempotency on a second run, and mute suppression), not just unit
      tests.
- [x] Discord webhook channel implementation. **Note (#41):** `discord.ts` implements
      `ChannelDispatcher` (#40's plugin contract) as the first real `DISPATCHERS` entry —
      posts a rich embed (red/"Incident opened" vs. green/"Incident resolved", per the issue's own
      "visibly different content" AC) with Project/Status/Started/Resolved/Duration/Cause fields.
      Config validated per-dispatcher (`{ webhook_url: string }`), never throws (a malformed
      config, network failure, or non-2xx Discord response — confirmed live with an actual revoked
      webhook returning a real 404 "Unknown Webhook" — all report `{ ok: false, error }`, isolated
      per #40's own per-channel-failure contract). Verified end-to-end against a real Discord
      webhook (both transitions delivered and visually confirmed by the user, plus the graceful-
      failure path), not just the 24 Deno unit tests (7 new in discord.test.ts).
- [x] ~~Telegram bot channel implementation.~~ **Descoped (#42, decided 2026-08-25, full removal):**
      not pursuing a Telegram `ChannelDispatcher` implementation — setting up a bot (@BotFather + a
      chat id) is meaningfully more setup friction than Discord's webhook for the one self-hosting
      user this app serves today, and Discord (#41) already proved the plugin contract (#40) end-
      to-end. Removed from both code (no stub, no `NotificationChannelType` member) and schema
      (`remove_telegram_channel_type` migration — `notification_channels.type` can no longer even
      be `'telegram'`), and the three marketing-copy mentions of Telegram support were corrected
      to match. The dispatch contract would still support adding a real implementation back later
      with zero changes to `notifier.ts` — this is a "not now," reversible via a future migration
      + `discord.ts`-shaped module, not an architectural dead end. See docs/PRD.md §5.5 for the
      same note.
- [x] Generic outgoing webhook channel implementation. **Note (#43):** `webhook.ts` implements
      `ChannelDispatcher` as the third real `DISPATCHERS` entry — POSTs a stable, versioned-in-
      spirit JSON payload (`event`, `project`, `incident` incl. `duration_seconds`, `sent_at`),
      documented in full at `supabase/functions/notifier/WEBHOOK_PAYLOAD.md` per the issue's own
      "documented as a stable contract" AC — co-located with the code, not under `docs/`, since
      that folder is gitignored/local-only and this contract needs to actually ship in the repo. Config validated as an absolute http(s) URL; a malformed config,
      network failure (DNS, connection refused), or non-2xx response all report `{ ok: false,
      error }`, never thrown. 8 new Deno unit tests (`webhook.test.ts`). Verified end-to-end
      against a real webhook.site URL: open event delivered and payload contents confirmed by the
      user, resolve event caught and confirmed by the *automatic* 1-minute `pg_cron` trigger
      (proving the scheduled path works in production, not just manual invocation), and a real DNS
      failure against a genuinely nonexistent domain gracefully captured and reported.
- [x] Email channel (transactional email provider integration). **Note (#44):** `email.ts`
      implements `ChannelDispatcher` via Resend's HTTP API (not raw SMTP — no first-class SMTP
      client in Deno Edge Functions, and an HTTP-API transactional provider is simpler/more
      reliable in a serverless runtime). No verified domain needed: without one, Resend sends from
      its own `onboarding@resend.dev` and only to the account's own signup address, which is
      exactly this app's real use case (a self-hosting user alerting themselves) — a permanent,
      free configuration, not a sandbox limitation to graduate out of; `RESEND_FROM_ADDRESS` can
      override the sender later with zero code change if a domain is verified. The API key is
      threaded into `createEmailDispatcher` as a parameter (read once via a permission-safe
      `readEnv` wrapper in `dispatch.ts`, set via `pnpm supabase secrets set RESEND_API_KEY=...`,
      documented in README.md) rather than read inside the dispatcher itself, keeping every test in
      `email.test.ts` free of any `Deno.env`/`--allow-env` dependency and keeping "exactly one place
      in the codebase reads the raw secret" — never logged, confirmed by a live 401 test not
      echoing the key. 15 new Deno unit tests. Verified end-to-end via a real Resend account/API
      key: open and resolve emails both delivered and visually confirmed by the user (the resolve
      one caught by the automatic `pg_cron` schedule again, same as #43), and a real Resend `403
      validation_error` (sandbox mode's own recipient restriction) gracefully captured with no
      crash and no key leak.
- [x] Per-project notification rules UI (channel selection, escalation threshold, mute toggle).
      **Note (#45):** new `src/features/notifications/` module, since no prior issue covered
      creating a `notification_channels` row at all — this issue's own acceptance criteria
      ("attach one or more *existing* notification_channels") presuppose a channel-management UI
      that didn't exist yet, so it's built here as the necessary prerequisite rather than punted:
      `/dashboard/notifications` (create/edit/activate/delete a Discord/email/webhook channel,
      `config` masked server-side per `notification_channels`'s own #9 column comment, same
      convention as `features/projects/lib/headers.ts`) plus a `ProjectNotificationRules` panel on
      the project detail page to attach/detach a channel, set `escalation_threshold`, toggle
      `digest_only`, and mute/unmute (`is_muted`, #40's own mute mechanism) — all via typed server
      actions mirroring `features/projects/lib/actions.ts`, with no manual `user_id`/ownership
      checks (fully delegated to the existing RLS policies from #9). Every mutation is a plain
      Postgres write through the RLS-scoped server client, so it's live for `notifier`'s next
      dispatch with no redeploy, per the issue's third acceptance criterion.
- [x] Digest mode: daily/weekly summary email. **Note (#46):** new `supabase/functions/digest/`
      Edge Function, scheduled on two separate `pg_cron` jobs (`schedule_digest_cron` migration) --
      a wall-clock cadence, not the prober/notifier's shared 1-minute due-work poll (see that
      migration's own reasoning). Added `project_notification_rules.digest_frequency` ('daily' |
      'weekly', default 'daily') since #45's `digest_only` boolean had no cadence of its own to
      pick from -- the PRD explicitly asks for both as distinct options. Two new service_role-only
      SQL functions (`create_digest_functions` migration): `get_digest_recipients(p_frequency)`
      (distinct user+email pairs with a matching `digest_only` rule) and
      `get_user_portfolio_summary(p_user_id, p_period_hours)` (that user's whole portfolio --
      every active project, not just ones with a digest_only rule, per the issue's own
      "portfolio-level, not one email per project" AC). Deliberately does NOT reuse/modify
      `get_project_uptime_summary` (#29, authenticated-only, RLS/`auth.uid()`-scoped) -- these two
      are new, explicitly `p_user_id`-parameterized, and granted only to `service_role`, matching
      `get_due_projects`' (#20) own "security invoker is correct, service_role already bypasses
      RLS by role" precedent, not `security definer`. Email content/delivery
      (`digest/email.ts`) duplicates (doesn't import) `notifier/email.ts`'s Resend-POST plumbing,
      per this codebase's own per-function-directory isolation convention -- reuses the same
      `RESEND_API_KEY`/`RESEND_FROM_ADDRESS` secrets from `#44`, no new secret. 19 new Deno unit
      tests across `digest.test.ts`/`email.test.ts` (recipient resolution, per-cadence period
      length, one recipient's failure isolated from another's, zero-active-projects still sends a
      confirming digest). `src/features/notifications/` (#45) extended with a digest frequency
      select, shown once "Digest only" is toggled on.
- [x] API key generation + management UI (also unblocks Phase 2's registration API). New
      `api_keys` table (`user_id`, `label`, `key_hash`, `key_prefix`, `last_used_at`,
      `revoked_at`) with owner-only RLS (select/insert/update, no delete -- a key is revoked, not
      deleted, so its audit trail survives). Plaintext key is 32 bytes of randomness
      (`generateApiKey`), shown to the user exactly once at creation in a two-step
      `GenerateApiKeyDialog`, then only its SHA-256 hash is ever stored -- a plain unsalted hash is
      intentional (high-entropy random secret, not a user password, same approach GitHub/Stripe
      use), enabling an O(1) indexed lookup in `verifyApiKey` instead of a per-row compare.
      `key_hash` is never selected in any client-facing query (not even masked) -- `ApiKey`'s type
      omits it entirely. `src/features/api-keys/` follows the notifications/projects feature
      conventions (barrel, typed Server Action results, `Card`+`Table` list with `AlertDialog`
      revoke confirmation). New `/dashboard/api-keys` page + sidebar nav entry. Verified end-to-end
      against the live linked project (bogus key -> 401, valid key -> 201 + `last_used_at`
      stamped, revoked key -> 401), which is what surfaced the `src/proxy.ts` bug fixed alongside
      this (see the Phase 2 registration-route note above).

### Exit Criteria
A simulated incident produces a real Discord notification within one prober tick of the incident
being detected, and muting a project actually suppresses its alerts.

---

## Phase 7 — Keep-Alive / Anti-Idle

**Goal:** The original motivating problem — free-tier cold starts — is actually solved.

### Readiness Checklist
- [ ] Phase 3 (prober) done, since keep-alive reuses the same scheduling infrastructure.
- [ ] Decide fixed-schedule vs. learned idle-timeout approach (PRD open question) — pick
      fixed-schedule for v1 unless there's a reason to do otherwise; don't build adaptive learning
      speculatively.

### Tasks
- [x] `keep_alive_enabled` toggle wired into prober scheduling (independent of monitoring/alerting
      state). Done in #48: new `get_due_keep_alive_projects()` SQL function selects purely off
      `keep_alive_enabled = true` on a fixed 10-minute cadence (readiness checklist's
      fixed-schedule decision), tracked via a new `projects.last_keep_alive_at` column, fully
      decoupled from `get_due_projects()`/`checks.checked_at`. Reuses the prober Edge Function's
      existing pg_cron tick via a new `keep-alive.ts` module, deliberately outside
      `try_acquire_prober_lock` and never calling `persist.ts`/`incidents.ts` -- verified live that
      a keep-alive ping writes zero `checks` rows. No UI to toggle `keep_alive_enabled` yet (still
      only settable via direct DB/seed edit) -- flagged as a follow-up, out of this issue's literal
      scope ("wired into prober scheduling"). UI added in #49 below.
- [x] Configurable active window (don't ping outside configured hours). Done in #49: nullable
      `keep_alive_window_start`/`_end` (`time`) + `keep_alive_timezone` (IANA name, validated at
      write time by a new `is_valid_timezone()` check constraint) columns on `projects`, all-or-
      nothing enforced by a check constraint -- null means "always warm" (PRD §5.8's fallback),
      verified live against the linked DB. `get_due_keep_alive_projects()` gates on the window
      (handling overnight wraparound, e.g. 22:00-06:00) entirely in SQL, so #48's `keep-alive.ts`
      needed no changes. Also exposes `keep_alive_enabled` itself as a toggle in the project
      form/settings UI for the first time (closing the gap noted above), alongside the new window
      fields, in the same "Advanced settings" accordion as the rest of the project's scheduling
      config.
- [x] Verify keep-alive pings don't themselves generate false incidents/alerts. Done in #50: this
      was already true by construction (#48's `keep-alive.ts` has no code path that writes to
      `checks`/`incidents` at all -- not written-and-tagged, genuinely never written, per this
      issue's own acceptance criterion to document that decision explicitly), so the work was
      verification + regression tests, not new production code. Added two `keep-alive.test.ts`
      cases asserting the fake client's `.from()` is only ever called with `"projects"`, never
      `"checks"/"incidents"`, on both an HTTP failure and a network-level fetch rejection.
      Verified live against the linked DB: an `is_active = false, keep_alive_enabled = true`
      project with a guaranteed-unresolvable `health_url` got pinged (`last_keep_alive_at` set) by
      the real prober cron with zero `checks`/`incidents` rows resulting; a second project with
      *both* `is_active` and `keep_alive_enabled` true produced exactly one `checks` row from the
      monitoring path and an independent `last_keep_alive_at` stamp from the keep-alive path, with
      no double-counting -- confirms `notifier.ts` (which only ever polls `incidents`, never
      `checks`) can't fire for a keep-alive-only ping either.

### Exit Criteria
A project with keep-alive enabled and no monitoring/alerting configured still receives scheduled
pings; a project outside its active window does not.

---

## Phase 8 — Public Status Pages

**Goal:** Status is shareable outside the authenticated dashboard (the resume/portfolio use case).

### Readiness Checklist
- [x] Phase 4 (dashboard visualizations) done — public pages reuse those components.
- [x] Decide opt-in vs. opt-out default for public status pages (PRD open question) before
      building the toggle. Decided in #51: opt-in (`is_public` defaults to `false`) — matches this
      app's existing owner-only-by-default posture everywhere else (RLS, API keys, notification
      config); a project's health-check URL/response times/failure history shouldn't be exposed
      without an explicit action.
- [x] Confirm RLS/route design so public pages can't leak data from other users' projects.
      Decided in #51: not a `projects` RLS policy (would require exposing the whole row, including
      `health_url`/`headers`/`hosting_provider`, to widen `select` for `anon`). Instead, three
      `security definer` functions (`get_public_project_status`/`_daily_history`/
      `_recent_checks`) each re-check `is_public` themselves and return only safe columns.

### Tasks
- [x] Per-project public status page route (unauthenticated, read-only). Done in #51:
      `/status/[id]`, reusing `StatusBadge`/`ResponseTimeChart`/`UptimeHeatmap` from
      `features/dashboard` rather than rebuilding them. Two real bugs found and fixed while
      completing this (already-scaffolded work from a prior session) beyond the original scope:
      (1) `UptimeHeatmap`'s `Tooltip` needs a `TooltipProvider` ancestor, which the dashboard gets
      for free from `SidebarProvider` but this standalone route doesn't — fixed by wrapping
      `PublicStatusView` in its own `TooltipProvider`. (2) A private/nonexistent project's page was
      returning HTTP `200` instead of `404` in a production build (`next start`) — `next dev`
      masked this since dev mode always renders fresh per-request. Root cause: under
      `cacheComponents`, every dynamic route streams a static shell with a `200` status before any
      page-level `notFound()` can run, so the status can never actually become `404` from inside
      the page component (confirmed against Next.js's own `notFound()` docs: "run that check in
      proxy instead"). Fixed by moving the allow/404 decision into `src/proxy.ts` middleware
      (which runs before any rendering begins) via a new cheap `is_project_publicly_visible()`
      gate function, separate from the heavier `get_public_project_status()` aggregation so the
      per-request middleware check doesn't pay for a full uptime rollup on every hit.
- [x] Per-project "make public" toggle in project settings. Done in #52: `is_public` toggle added
      to the project form's Advanced settings (same area as #49's keep-alive window), with copy
      spelling out exactly what becomes visible (status/uptime %/response-time history) and what
      never is (health-check URL/target, headers, auth tokens) plus the actual `/status/[id]` path.
      No new migration/RLS needed -- #51 already added `is_public` (default `false`) and the
      existing owner-only `projects_update_own` policy already covers it like any other column, so
      only the owner can ever flip it. Verified live end-to-end against a running production build
      (`pnpm build && pnpm start`): toggling `is_public` true/false/true/false made `/status/[id]`
      switch between `200` (full content, zero `health_url` leak) and `404` immediately on the very
      next request, no redeploy or cache-bust of any kind needed.
- [x] Aggregate public status page for the whole portfolio. Done in #53: unauthenticated `/status`
      route listing every currently-public project (name, status badge, headline 90-day uptime %),
      each linking out to its own #51 `/status/[id]` page. New `get_public_projects_summary()`
      security definer function (same is_public-filtering/safe-columns-only pattern as #51's three
      functions, adapted to return every qualifying row instead of at most one). Single-owner-first
      scope, per this issue's own instruction -- lists every public project app-wide, no
      multi-tenant portfolio routing, since PRD §5.7 multi-user support hasn't shipped. No
      middleware gate needed (unlike `/status/[id]`): an empty portfolio is a valid empty state,
      not a 404, and the function itself already filters to `is_public = true`. Verified live
      against a running production build: two public projects appeared (with working links to
      their own pages) and a third, private project never did, all with no session cookie.
- [x] Shareable link generation/copy UI. Done in #54: once a project is public, its full absolute
      `/status/[id]` URL (built from `window.location.origin` client-side -- no
      `NEXT_PUBLIC_SITE_URL` env var exists or was needed) appears in a read-only field right below
      the toggle, with a one-click copy button (`notify.success("Copied to clipboard")`, same
      icon-swap-on-copy convention as the API keys feature's own copy button). Hidden whenever
      there's nothing to share yet -- project is private, or is public but not yet saved (no id).

### Exit Criteria
A logged-out browser can view a public status page for an opted-in project and cannot access data
for a non-public project or another user's project. Verified live (`pnpm build && pnpm start`,
real HTTP requests, no session cookie): a public project's page renders its status/uptime/history;
a private project's page and a nonexistent/malformed id all return a genuine `404` with zero
project metadata in the response body.

---

## Phase 9 — Advanced Check Types & Multi-Region

**Goal:** Move beyond simple HTTP GET checks to cover the full PRD check surface.

### Readiness Checklist
- [ ] Phase 3 (core prober) stable in production use for at least one full week with no missed
      ticks, since this phase adds complexity on top of it.
- [ ] Confirm which check types are actually needed for the user's real project portfolio before
      building all five — prioritize by actual use, not PRD completeness alone.

### Tasks
- [x] TCP port check type. Done in #55: additive `projects.check_type` column (`'http'` default, so
      every pre-existing project is unaffected), reusing the existing `health_url` column as an
      overloaded "target" (holds "host:port" for `check_type = 'tcp'`, no new tcp_host/tcp_port
      pair -- same precedent as `method`/`body`/`expected_status` already being conditionally
      meaningful). `check.ts`'s `runHealthCheck` dispatches to a new `runTcpCheck` (raw
      `Deno.connect`, `Promise.race`'d against a timer since `Deno.connect` has no
      `AbortSignal`/cancellation of its own -- unlike `fetch`) for tcp projects, producing the same
      `CheckResult` shape so classify.ts/retry.ts/persist.ts don't need their own check_type
      branch just to handle it structurally -- they do each have one small branch for the actual
      status logic: a bare TCP check has no body/status to grade, so it's only ever "up" (connected
      within timeout) or "down" (refused/unreachable/timed out) per this issue's own acceptance
      criterion, never degraded/waking/unknown. `check_type`/`tcpTargetSchema` added to the
      project form (new "Check type" selector; HTTP-only fields -- Method, Request body, Expected
      status, Headers -- hidden for tcp) and re-validated server-side in actions.ts. Verified live
      against the deployed prober: a project targeting a real reachable host:port (`1.1.1.1:443`)
      produced an `up` check in ~2ms; one targeting a non-routable address (`192.0.2.1:9`)
      correctly timed out and produced a `down` check at exactly its configured timeout (3002ms
      total), not a hung invocation; pre-existing real http-type projects kept checking normally
      after deploy.
- [x] DNS resolution check type. Done in #56: additive `check_type = 'dns'` (constraint widened
      from #55's `('http', 'tcp')`), reusing `health_url` again as the overloaded target (a bare
      hostname, no scheme/port). `check.ts`'s `runDnsCheck` queries `A` records via
      `Deno.resolveDns`, raced against a timer the same way #55's `runTcpCheck` handles
      `Deno.connect` having no `AbortSignal` of its own. Classification deliberately differs from
      tcp's: per this issue's own task description, `classify.ts`'s dns branch keeps the
      timeout-vs-other-error split (timeout -> `down`, an NXDOMAIN/SERVFAIL-style resolver error
      -> `unknown`) instead of collapsing every failure to `down` the way tcp does, mirroring
      HTTP's own "DNS/network error that isn't a timeout is unknown, not down" reasoning -- it only
      skips the HTTP-only http_status/degraded/waking rules, which don't apply to a bare
      resolution. Verified live against the deployed prober: `example.com` produced an `up` check
      in ~5ms; a deliberately non-resolvable hostname produced `unknown` with the actual resolver
      error text ("no records found for Query ...") captured in `error_message`; existing real
      http-type projects in the portfolio kept checking normally after deploy.
- [x] SSL/TLS certificate validity + expiry check type. Done in #57, with a real platform
      surprise along the way: `check_type = 'ssl'` reuses `health_url` as a "host:port" target
      (same as tcp), classifying `up` (valid, not expiring soon), `degraded` (valid but expiring
      within `SSL_EXPIRY_WARNING_DAYS`, a fixed 14-day constant -- the acceptance criteria only ask
      for *a* configured window, not a per-project one), or `down` (expired/not-yet-valid/
      self-signed/connection error/timeout -- no separate "unknown" for this check type, per its
      own acceptance criteria). The straightforward approach -- `node:tls`'s
      `getPeerCertificate()`/`socket.authorized` -- works correctly on a local `deno run` (verified
      against badssl.com's expired/self-signed test certs before writing any check.ts code) but
      turned out **not to work at all on Supabase's actual Edge Runtime**: confirmed live (not
      assumed) that `authorized` is hardcoded `true` regardless of the real certificate, and
      `getPeerCertificate()` only ever returns `{subject, subjectaltname}`, never `valid_to`. Raw
      `Deno.connectTls().handshake()` is a dead end too (only ever exposes the ALPN protocol, per
      its own type declarations and live runtime reflection). Resolved (after checking in with the
      user on the tradeoff) by hand-rolling a minimal TLS 1.2 client (`tls-cert.ts`): a raw
      `Deno.connect` + a crafted ClientHello that omits the `supported_versions` extension so even
      a TLS-1.3-capable server falls back to 1.2, where the Certificate message arrives in
      cleartext before any key exchange -- no session keys ever derived, no decryption, the
      connection is abandoned right after reading that one message. Self-signed detection is a
      byte-for-byte issuer-vs-subject comparison; full chain-of-trust validation against a root CA
      store is explicitly out of scope (documented in code, not silently skipped). Verified live
      against the deployed prober with real hosts: `example.com` -> `up` in ~8ms;
      `expired.badssl.com` -> `down` with the certificate's *actual* 2015 expiry date extracted
      correctly via the hand-rolled parser; `self-signed.badssl.com` -> `down`, correctly
      distinguished from the expired case; existing real http-type projects kept checking normally
      after deploy.
- [x] Keyword/content match check (response body contains expected string). Done in #58 --
      `projects.expected_body_match` already existed on the schema (Phase 1), so this was pure
      code wiring, no migration. `runHttpCheck` (check.ts) computes a new `bodyMatchFailed`
      boolean against the full/untruncated response body text, not `response_snippet` (which is
      truncated to 2000 chars) -- otherwise a match string past that cutoff would be falsely
      reported as missing; covered by a dedicated test with a >2000-char body. `expected_body_match
      = null` (the default/existing-project case) always yields `bodyMatchFailed: false` by
      construction, guaranteeing zero behavior change for projects that don't use this. classify.ts
      treats `bodyMatchFailed` as `down`, checked right after the `expected_status` match and before
      the response-time degraded/waking thresholds -- a wrong-content response is never "successful
      but slow". Deliberately did *not* wire `bodyMatchFailed` into retry.ts's own (pre-existing,
      intentionally narrow) `isAttemptSuccessful` judgment -- its module comment already documented
      that retry's own success check stays minimal (error + status only) and defers response-time/
      body-match nuance entirely to classify.ts; a body-mismatch attempt still ends up correctly
      classified `down` either way, the only difference is whether a transient body-mismatch blip
      gets a retry-driven second chance, which #58's ACs don't ask for. Known, disclosed gap left
      out of scope: `incidents.ts`'s `deriveIncidentCause()` fallback message will describe a
      body-mismatch-caused `down` as "Unexpected HTTP status 200" (technically true `http_status`,
      misleading *reason*) since there's no schema field yet carrying a distinct "body mismatch"
      cause string -- `response_snippet` is already visible elsewhere in the dashboard as a
      workaround; revisit if this proves confusing in practice. Verified live against the deployed
      prober with three real throwaway projects hitting httpbin.org/html (whose body contains
      "Herman Melville"): `expected_body_match` present in the body -> `up`; present-but-wrong
      string configured -> `down` with `http_status: 200` (confirmed both via manual invocation and
      via the real `pg_cron` batch tick independently reaching the same classification and opening
      an incident over several consecutive minutes); `expected_body_match` unset -> `up`,
      unaffected. All three cleaned up afterward.
- [x] JSON path/value assertion check. Done in #59 -- two new nullable columns,
      `projects.expected_json_path`/`expected_json_value` (migration
      `20260827125355_add_json_path_assertion.sql`; unlike #58, couldn't reuse
      `expected_body_match`, since #58 already claimed that column exclusively for plain substring
      matching and a JSON path assertion needs both a path *and* an expected value). New module
      `json-path.ts`: a minimal hand-rolled dot/bracket-path walker (`$.data.items[0].status`), not
      a full JSONPath (RFC 9535) implementation -- no wildcards/filters/recursive descent, matching
      this codebase's "boring, extensible" precedent for #56/#57's own scoping. `runHttpCheck`
      (check.ts) computes a new `jsonAssertionFailed` boolean the same way/place as #58's
      `bodyMatchFailed` (against the full, untruncated body; both `expected_json_path` and
      `expected_json_value` must be set to run at all); classify.ts treats it as `down` right
      alongside `bodyMatchFailed`. Unlike #58, this issue's ACs explicitly required the
      mismatch/parse-error text in `error_message` -- rather than reusing `CheckResult.error_message`
      itself (which classify.ts's "unknown" branch treats as "the check couldn't execute at all",
      and which is only ever null on a successful response), the specific message is carried on a
      new `jsonAssertionError` field and merged into the persisted `checks.error_message` column by
      persist.ts (and into manual-check.ts's own JSON response), so `incidents.ts`'s
      `deriveIncidentCause()` picks it up automatically -- closing the exact gap #58 left disclosed
      above, but only for this feature, not retrofitted onto #58's own `bodyMatchFailed`. Same
      retry.ts exclusion as #58, same reasoning (a status-matching-but-failed-assertion attempt
      counts as "successful" for retry purposes; classify.ts alone decides it's `down`). Verified
      live against the deployed prober with a real throwaway project hitting httpbin.org/json
      (whose body is `{"slideshow": {"author": "Yours Truly", ...}}`): `$.slideshow.author` = "Yours
      Truly" configured -> `up`; same path with a wrong expected value -> `down`,
      `http_status: 200`, `error_message` containing the exact expected-vs-got mismatch text;
      `$.nonexistent.path` -> `down` with a "not found" `error_message`; project with neither field
      set -> `up`, unaffected. All confirmed via manual invocation; cleaned up afterward.
- [x] Multi-region probing (multiple Edge Function regions/deployments). Done in #60 -- no separate
      per-region *deployment* exists (or is needed): one `prober` deployment already runs
      everywhere on Supabase's Edge Runtime, and its documented `x-region` request header
      (https://supabase.com/docs/guides/functions/regional-invocation) pins a given invocation to a
      specific AWS region on demand. The batch tick (index.ts, still the single pg_cron-triggered,
      prober_lock-guarded run per tick -- unchanged) recursively calls *itself* once per configured
      region (new `region-probe.ts`'s `PROBE_REGIONS`: `us-east-1`/`eu-west-2`/`ap-southeast-1`,
      deliberately odd so a majority vote can never tie), each sub-call carrying the *entire*
      due-project batch rather than one call per project -- O(regions) added Edge Function
      invocations per tick, not O(regions x due projects), which matters against the free tier's
      500k/month invocation budget once a real portfolio has more than a handful of due projects.
      Each region's raw, classified result is written as its own `checks` row (new
      `is_consensus: false` column, `add_multi_region_probing` migration) -- finally populating the
      Phase 1 `checks.region` column, which had been always-null until now -- alongside one
      additional majority-vote "consensus" row per project (`is_consensus: true`,
      `region-probe.ts`'s `deriveConsensusStatus`: down only when a strict majority of *responding*
      regions agree; a region whose own recursive sub-call failed at the infra level abstains
      entirely rather than being miscounted as a legitimate down vote, and if every region abstains
      the round is `unknown` -- neutral, never a false escalation/resolve). `incidents.ts`'s
      escalation/auto-resolution streak (#35/#36) now filters to `is_consensus = true` only, so a
      single region's own raw row never independently counts as its own down data point -- exactly
      the false positive this issue exists to eliminate. Manual "run check now" (#28) and keep-alive
      (#48) are both deliberately *not* regionally fanned out -- out of scope for #60's own
      acceptance criteria, and would triple their own cost for no requested benefit; manual checks
      still tag their one row with whatever region they happen to execute in, purely informational.
      A subtle bug caught by `region-probe.test.ts`'s own unit tests before it ever reached
      production: the initial `deriveConsensusStatus` let a minority-down *primary* region's own
      status leak straight through as the round's consensus whenever down wasn't a majority --
      fixed to skip over any down-voting region for the passthrough, not just gate on majority.
      Verified live against the deployed prober with a real throwaway project: confirmed `x-region`
      genuinely forces different `SB_REGION` values (proven via direct region-probe invocations, not
      just trusted from docs); a real always-up target produced exactly 3 raw region rows + 1
      consensus row, all `up`; pointing the same project at `httpbin.org/status/500` (matching
      status across every region) produced 3 down rows + a down consensus row, and a genuine
      incident opened after the 2nd consecutive down round with the correct `started_at` and cause,
      then auto-resolved 2 rounds after pointing it back at a healthy URL; most notably, a
      `httpbin.org/delay/3` target with a tight `timeout_ms` produced *genuine* real-world regional
      divergence from actual cross-continent network latency -- `ap-southeast-1` timed out (`down`)
      while `us-east-1`/`eu-west-2` squeaked through as `degraded` -- and the consensus correctly
      resolved to `degraded`, not `down`, opening no incident, i.e. AC2 confirmed against real
      network conditions, not merely simulated. All test data cleaned up afterward; the real
      pre-existing project portfolio was left untouched throughout (only observed via normal batch
      tick responses).
- [x] Rate-limiting/backoff so Upkeep's own traffic isn't flagged as abusive by monitored hosts. Done
      in #61 -- two new nullable/defaulted columns, `projects.rate_limit_backoff_until`/
      `rate_limit_backoff_count` (migration `20260827220338_add_rate_limit_backoff.sql`), plus
      `checks.is_rate_limited` (defaults `false`, mirrors `is_consensus`'s "written for visibility,
      excluded from escalation" role from #60). New module `rate-limit.ts`: `isRateLimited` (HTTP
      429 only -- the "consecutive connection-level failures" half of the issue's task description
      is a disclosed, not-implemented follow-up, since retry.ts only ever exposes the *final*
      attempt's result, not per-attempt outcomes) and `computeBackoffSeconds` (exponential, doubling
      off the project's own `check_interval_seconds` rather than a global base, capped at
      `MAX_BACKOFF_SECONDS` = 1 hour). `get_due_projects()` (same migration) excludes a project
      while its backoff window hasn't elapsed -- AC1. `applyRateLimitBackoff` grows/clears that
      window after every round (batch tick and manual check both call it) -- AC2's self-reset the
      moment a check comes back without a 429. `incidents.ts`'s escalation query (not the
      resolution one -- a rate-limited round should still count against "all up" recovery) now also
      filters `is_rate_limited = false`, on top of #60's `is_consensus = true` -- AC3, proven by a
      dedicated integration test (`incidents.test.ts`) that two consecutive 429s never open a false
      incident. Surfaced per the issue's own "somewhere visible" wording: an amber notice on the
      project detail page while backed off, and a "Rate limited" badge next to the status badge on
      the check log table -- distinguishing a backoff round from a real `down` at a glance, not
      just in the raw data. Known, disclosed gap: `is_rate_limited` rows aren't excluded from
      uptime-% calculations, so a sustained rate-limit period still dents a project's uptime numbers
      alongside not opening an incident -- left as-is rather than silently expanding scope beyond
      the issue's own three ACs. Verified live against the deployed prober with a real throwaway
      project hitting `httpbin.org/status/429`: excluded from `get_due_projects()` for the full
      backoff window (confirmed no check row was written at the normal-cadence tick that fell
      inside the window); backoff grew exponentially over two consecutive 429 rounds
      (120s -> 240s) with zero incidents opened despite two consecutive `down` rounds; pointing the
      same project back at a healthy URL immediately cleared `rate_limit_backoff_count`/`_until` on
      the very next check. All test data cleaned up afterward.

### Exit Criteria
Each new check type has at least one project in the dashboard actively using it and producing
correct pass/fail results.

---

## Phase 10 — Data Retention & Aggregation

**Goal:** `checks` doesn't grow unbounded; long-term trend data survives without raw-row bloat.

### Readiness Checklist
- [ ] Phase 3 has been running long enough that raw `checks` growth is measurable.
- [x] Retention window decided (PRD §10): **7 days.**

### Tasks
- [x] Scheduled rollup job: raw checks → `checks_aggregated` (hourly, then daily) (#62).
- [x] Automatic pruning of raw checks past the 7-day retention window (#63).
- [x] Exportable logs/checks (CSV/JSON export) from the dashboard (#64).
- [x] Verify uptime %/graphs on the dashboard correctly blend raw + aggregated data across the
      retention boundary (#65) -- found and fixed two double-counting bugs
      (`get_project_uptime_summary`, `getResponseTimeSeries` 30d/90d) surfaced by the
      verification itself.

### Exit Criteria
`checks` table size stabilizes (old raw rows pruned on schedule) while historical uptime % for
periods beyond the retention window remains accurate via `checks_aggregated`.

---

## Phase 11 — Extensibility & Open-Source Readiness

**Goal:** The codebase is safe and pleasant to hand to someone else, per PRD §5.10.

### Readiness Checklist
- [ ] All prior phases functionally complete — don't polish for open-source before the product
      works end-to-end.
- [ ] Confirm final naming/branding (PRD open question) — renaming after release is disruptive.
- [ ] Audit for hardcoded secrets / project-specific config before any public repo exposure.

### Tasks
- [x] Documented health-check endpoint contract/spec (#66) --
      `supabase/functions/prober/HEALTH_CHECK_CONTRACT.md`, linked from the README.
- [x] Example health-check endpoint snippets for Express, FastAPI, Next.js API routes (#67) --
      `supabase/functions/prober/HEALTH_CHECK_EXAMPLES.md`, verified against a real running
      instance of each, linked from the README and HEALTH_CHECK_CONTRACT.md.
- [x] Self-hosting docs: full README rewrite, `.env.example` finalized, setup script (#68) --
      `pnpm setup` (`scripts/setup.mjs`), verified end-to-end against the linked project.
- [x] Plugin-style architecture pass for notification channels (#69) -- verified via a real
      proof-of-concept (`slack`), reverted after; `ADDING_A_CHANNEL.md`.
- [x] Plugin-style architecture pass for check types (#70) -- unlike #69, the claim did NOT
      already hold; refactored check.ts/classify.ts/retry.ts's per-check-type `if` chains into a
      real `CHECK_TYPES` registry (check-types.ts + http/tcp/dns/ssl.ts), then verified with a
      proof-of-concept (`websocket`), reverted after; `ADDING_A_CHECK_TYPE.md`.
- [ ] License file + contribution guidelines.

### Exit Criteria
A third party can clone the repo, follow the README alone, and get a working local instance
monitoring one test project without asking questions.

---

## Phase 12 — Platform Usage Budgets

**Goal:** Monitoring/keep-alive traffic doesn't silently burn through a monitored project's own
free-tier compute allowance (Vercel Active CPU minutes, Render instance-hours, Railway usage
credits, Appwrite executions, etc.) -- a user can see how much of a real hosting account's
monthly quota their projects already claim, and let Upkeep derive a safe check interval from a
minute budget instead of guessing a number.

### Readiness Checklist
- [x] Decided: budget is expressed in **minutes of compute per month**, not raw request counts
      -- matches how the user described it, and maps onto Vercel's literal Active CPU minutes
      most directly (other platforms' real units are approximated -- see each tier's `notes`).
- [x] Decided: v1 is an **estimate/allocation calculator**, not a real usage meter -- no
      OAuth/API polling of Vercel/Render/Railway/Appwrite (none offer a simple, uniform public
      usage API). An overridable `assumed_ms_per_request` converts a minute budget into a check
      interval.
- [x] Decided: **keep-alive counts against the same budget** -- `keep_alive_interval_minutes`
      is now a per-project column (default 10, preserving every pre-existing project's exact
      behavior) instead of a hardcoded SQL literal, so a keep-alive allocation can derive a
      different cadence.
- [x] Decided: budget is **pooled per real hosting account** (a new `platform_accounts` entity),
      not just by `hosting_provider` text -- correctly handles two separate real accounts on the
      same platform instead of merging their pools.
- [x] Confirmed the prober's scheduling (`get_due_projects()`) is purely column-driven
      (`check_interval_seconds`/`checked_at`/`rate_limit_backoff_until`, no per-provider logic) --
      this feature only needs to compute and write those columns, never touch the prober itself.

### Tasks
- [x] `hosting_platforms` + `hosting_platform_tiers` reference catalog (seeded: Vercel, Render,
      Railway, Appwrite, Fly.io, Other/Custom), each tier's free-quota estimate carrying a
      `source_url`/`verified_at` since these numbers drift and need periodic re-verification.
- [x] `platform_accounts` table (user-owned: label, platform/tier, `quota_minutes_per_month`,
      `assumed_ms_per_request`) + owner-only RLS.
- [x] `projects.platform_account_id`/`budget_minutes_per_month`/
      `keep_alive_budget_minutes_per_month`/`keep_alive_interval_minutes` columns, all
      nullable/defaulted -- zero behavior change for a project that doesn't opt in.
      `get_due_keep_alive_projects()` updated to read `keep_alive_interval_minutes` instead of a
      hardcoded 10-minute literal.
- [x] `src/features/platform-accounts/` module: account CRUD, pool accounting (allocated vs.
      quota across every attached project), `/dashboard/hosting-accounts` page (user-facing
      name -- the underlying feature/table names stay "platform account[s]").
- [x] `src/features/platform-accounts/lib/platform-budget.ts`: pure budget-minutes <->
      check-interval conversion, imported both server-side (the authoritative write) and
      client-side (the project form's live preview).
- [x] "Add project" form: platform account selector + monitoring/keep-alive budget inputs with
      a live derived-interval preview, replacing free-text `hosting_provider` entry when an
      account is attached (auto-synced from the account's platform name instead).
- [x] Project detail page: "Platform budget" detail row (allocation + % of the account's pool
      used) when a platform account is attached.

### Exit Criteria
A platform account can be created with a monthly quota, two projects can each be given a minute
budget against it, and each project's `check_interval_seconds` (and, if keep-alive is on,
`keep_alive_interval_minutes`) is correctly derived and visible -- with the account's pool
display correctly reflecting both projects' allocations.

---

## Explicitly out of scope (per PRD §3 Non-Goals)

Do not create phases/issues for: replacing full APM/observability tools, monitoring
private/internal-only infrastructure, or enterprise-grade SLA/compliance audit trails.
