# Product Requirements Document: Upkeep

**Project Name:** Upkeep — Personal Uptime & Health Monitor
**Owner:** [Your Name]
**Status:** Draft v1.0
**Last Updated:** August 21, 2026

---

## 1. Overview

Upkeep is a self-hosted, lightweight uptime and health monitoring platform for personal/portfolio projects deployed across free-tier hosting providers (Render, Railway, Fly.io, Vercel, etc.). Many free-tier hosts spin down idle services after a period of inactivity, causing slow "cold starts" or apparent downtime when a recruiter, interviewer, or visitor opens a live demo link.

Upkeep periodically pings a registered health-check endpoint on each project, records the result, keeps services warm through scheduled traffic, and surfaces a single dashboard showing the real-time status of every project — removing the need to manually check N different deployments.

The system is built on Supabase (Postgres + Edge Functions + Scheduled Triggers) for the backend/data layer, with a decoupled frontend dashboard deployable on any static/edge host (Vercel, Netlify, Cloudflare Pages). The architecture is intentionally provider-agnostic: any project, regardless of tech stack or host, can be monitored as long as it exposes an HTTP(S) health endpoint.

---

## 2. Problem Statement

- Free-tier hosting plans (Render free web services, Railway free tier, etc.) sleep/suspend after a period of inactivity, causing:
  - Slow first-load times for anyone visiting a live demo (bad first impression for recruiters/interviewers)
  - No visibility into whether a project is actually reachable at any given moment
  - Manual, repetitive checking across multiple hosting dashboards
- Commercial tools (UptimeRobot, Better Stack, Pingdom) solve this but are:
  - Overkill for a handful of personal projects
  - Subject to their own free-tier limits (check frequency, number of monitors, retention)
  - Not customizable to specific needs (e.g., distinguishing "cold start" from "actually down")
- There is no single owned, extensible system tailored to a developer's own portfolio that can grow into a general-purpose open-source monitoring tool.

---

## 3. Goals & Objectives

1. Provide continuous, automated health checks for all registered personal projects.
2. Prevent perceived downtime caused by free-tier idle spin-down through scheduled keep-alive pings.
3. Provide a single-pane-of-glass dashboard for real-time and historical status.
4. Log enough detail per check to debug issues without re-visiting the original host's dashboard.
5. Remain host-agnostic and tech-stack-agnostic for both the monitored projects and Upkeep itself.
6. Be architected cleanly enough to open-source and support multi-user/public use without requiring a rewrite.

### Non-Goals
- Replacing full-featured commercial APM/observability tools.
- Monitoring internal/private infrastructure not reachable over public HTTP(S).
- Guaranteeing enterprise-grade SLA monitoring or compliance-grade audit trails.

---

## 4. Target User / Persona

**Primary:** The project owner (you) — a developer with multiple personal/resume projects deployed across free-tier platforms who wants passive assurance that all demos are live and reachable.

**Secondary:** Other individual developers or small teams who self-host Upkeep to monitor their own project portfolios without paying for third-party uptime services.

---

## 5. Feature List

Every feature below is a real product requirement. They are grouped by functional area, not by priority/phase — treat this as the complete feature surface of the product.

### 5.1 Project Registration & Management
- Add a project with: name, description, health check URL, expected HTTP status code (default 200), check interval, tags/category (e.g., "backend," "frontend," "API"), hosting provider label (Render, Railway, Vercel, etc.).
- Edit/deactivate/delete a registered project.
- Bulk import projects via a JSON/CSV list.
- Per-project custom headers or auth tokens for health endpoints that require a secret/bearer token (so health URLs aren't fully public/guessable).
- Per-project custom check interval (not a single global interval — a low-traffic API might need checks every 5 minutes; a critical demo every 1 minute).
- Group projects into collections/folders (e.g., "Resume Projects," "Side Projects," "Client Work").
- Programmatic registration API — a project can self-register its health endpoint at deploy time via a POST request instead of manual dashboard entry.

### 5.2 Health Check Engine (Prober)
- Scheduled Edge Function triggered via Postgres cron (`pg_cron`) or Supabase Scheduled Triggers, running at a fixed base tick (e.g., every 1 minute) and evaluating which projects are due based on their individual interval.
- HTTP(S) GET/POST health checks with configurable method, headers, and body.
- Configurable timeout per project (default e.g. 10s) — long timeouts expected for cold-start scenarios.
- Retry logic: on failure, retry once (or a configurable number of times) with a short delay before marking a project "down," to avoid false positives from cold starts or transient network blips.
- Status classification: `up`, `down`, `degraded/slow`, `waking` (cold start detected: successful response but above response-time threshold), `unknown` (check itself errored, e.g., DNS failure).
- Response time measurement (ms) recorded per check.
- Store raw response metadata on failure: HTTP status, response body snippet, error type/message, timestamp.
- Support for additional check types beyond HTTP GET:
  - TCP port check
  - DNS resolution check
  - SSL/TLS certificate validity and expiry check
  - Keyword/content match check (verify response body contains expected string, not just status code)
  - JSON path/value assertion (e.g., health response must contain `"status": "ok"`)
- Multi-region probing — trigger checks from multiple Edge Function regions/deployments to distinguish "project is actually down" from "network partition between one region and the host."
- Rate-limiting/backoff protection so Upkeep itself doesn't get blocked or flagged as abusive traffic by monitored hosts.

### 5.3 Data Storage & Logging
- Append-only `checks` table storing every ping result (timestamp, project, status, response time, HTTP code, error details).
- Automatic data retention/aggregation policy: raw checks kept at full granularity for a 7-day window (§10, decided), then rolled up into hourly/daily aggregates for long-term trend storage without unbounded table growth.
- Structured application-level logging inside each monitored project (optional client-side logging helper/snippet) that reports richer health info beyond a simple 200 OK — e.g., DB connection status, memory usage, last error, uptime since last restart.
- Exportable logs/checks (CSV/JSON export) for offline analysis.

### 5.4 Incident Management
- Automatic incident detection: a sequence of consecutive `down`/`degraded` checks is grouped into a single incident record (start time, end time, duration, cause if known) rather than shown as raw disconnected rows.
- Manual incident annotation — ability to add a note to an incident (e.g., "host maintenance," "my bug, fixed in commit X").
- Incident history view per project and globally across all projects.
- Escalation threshold — only fire an incident/alert after N consecutive failures, to suppress noise from single transient blips.
- Auto-resolve incidents when a project returns to `up` status for M consecutive successful checks.

### 5.5 Alerting & Notifications
- Configurable notification channels: Discord webhook (shipped, #41), email (via Supabase + a transactional email provider), generic outgoing webhook for custom integrations. **Telegram bot support is descoped, not just deprioritized** (#42, decided 2026-08-25) — removed from the `notification_channels.type` check constraint entirely (`remove_telegram_channel_type` migration, a `'telegram'`-typed channel can no longer even be created) and from the dispatch-layer code (no stub, no type union member); the plugin-style dispatch contract (#40) would still support adding it back later with zero changes to the notifier's own orchestration logic, but this isn't just a "not implemented yet" placeholder the way webhook/email (#43/#44) still are. Revisit only if there's real demand, since setting up a Telegram bot (@BotFather + chat id) is meaningfully more setup friction than Discord's webhook for the one self-hosting user this app is built for today.
- Per-project notification rules (e.g., only alert for "critical" tagged projects, mute notifications for a project temporarily).
- Notification on status change only (not on every check) to avoid spam.
- Digest mode — daily/weekly summary email of overall portfolio health instead of (or in addition to) real-time alerts.
- Escalation policy support (e.g., alert once immediately, then again if unresolved after 30 minutes).

### 5.6 Dashboard & Visualization
- Overview page: all projects with current status indicator (color-coded), last checked timestamp, and rolling uptime percentage (24h / 7d / 30d / 90d).
- Per-project detail page: response time graph over time, uptime history heatmap/timeline (similar to GitHub contribution graph or status-page.io style bar), incident list, raw check log.
- Filter/search/group projects by tag, hosting provider, or status.
- Dark/light theme toggle (developer-facing tool, dark mode expected as default).
- Public status page per project — a shareable, read-only link showing that project's live status and uptime history (useful to link from a resume/portfolio site directly).
- Aggregate public status page — a single page showing the status of the entire portfolio, embeddable or linkable from a personal site.
- Mobile-responsive dashboard view.

### 5.7 Authentication & Access Control
- Supabase Auth integration (email/password, magic link, or OAuth) to gate access to the dashboard and management functions.
- Row-Level Security (RLS) policies scoping each authenticated user to only their own projects, checks, and incidents, supporting multi-tenant/multi-user use.
- API key generation for programmatic project registration and health reporting.
- Role support (owner, viewer) for collaborative/team use.
- Single-user, private-repo deployments can run with a single owner account and no additional role complexity, while the same schema and auth layer support multi-user use without changes.

### 5.8 Keep-Alive / Anti-Idle Functionality
- Configurable "keep-alive mode" per project — pings frequently enough (tuned to the specific host's idle-timeout window) purely to prevent free-tier spin-down, independent of whether monitoring/alerting is enabled for that project.
- Smart scheduling to avoid unnecessary load — only keep-alive-ping during a configurable active window (e.g., don't bother keeping a demo warm at 3 AM if no one will view it) or ping continuously if the goal is guaranteed always-warm state.

### 5.11 Platform Usage Budgets (decided 2026-10-02, Phase 12)
- The prober's own traffic consumes the *monitored project's* free-tier compute allowance
  (Vercel Active CPU minutes, Render instance-hours, Railway usage credits, Appwrite executions,
  etc.) — a user can create a "platform account" representing one real hosting account (picking
  a known platform/tier preset, or entering custom numbers for a VPS/unlisted platform), attach
  multiple projects to it, and see how many of that account's monthly compute-minutes its
  attached projects already claim.
- Per-project budget allocation (in minutes/month) against the attached account's shared pool,
  for monitoring checks and (separately) keep-alive pings — Upkeep derives
  `check_interval_seconds`/`keep_alive_interval_minutes` from the allocation instead of the user
  picking a raw interval number.
- **Decided scope (v1): an estimate/allocation calculator, not a real usage meter.** No
  OAuth/API integration with Vercel/Render/Railway/Appwrite to read actual usage — a documented,
  overridable "assumed ms per request" per account converts a minute budget into a check
  interval. Real per-platform usage metering is an explicitly deferred future phase, not a
  silently dropped requirement — revisit only if a given platform exposes a usable public usage
  API.

### 5.9 Platform & Deployment Flexibility
- Backend (Postgres schema, Edge Functions, cron) hosted on Supabase, but not hard-coupled to it — the prober logic should be portable to a plain Node/Deno/Python cron worker if migrating off Supabase.
- Frontend dashboard deployable independently on any static/edge hosting platform (Vercel, Netlify, Cloudflare Pages, self-hosted).
- No restriction on the tech stack of monitored projects — any project exposing an HTTP(S) endpoint (Node, Python, Go, static sites, etc.) can be registered, regardless of where it's hosted (Render, Railway, App Platform/DigitalOcean, Convex, Vercel, Fly.io, etc.).
- Environment-based configuration (no hardcoded secrets) so the whole system can be redeployed to a different Supabase project or environment cleanly.

### 5.10 Extensibility / Open-Source Readiness
- Clean separation of concerns (prober engine, data layer, notification layer, dashboard) so each can be extended or swapped independently.
- Documented health-check endpoint contract/spec so others can wire up their own projects to Upkeep easily.
- Example health-check endpoint snippets/templates for common stacks (Express, FastAPI, Next.js API routes, etc.) to make onboarding a new project fast.
- Self-hosting documentation (README, .env.example, setup script) for eventual open-source release.
- Plugin-style architecture for notification channels and check types, so new integrations don't require touching core logic.

---

## 6. Data Model

### `projects`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| description | text | nullable |
| health_url | text | |
| method | text | default 'GET' |
| expected_status | int | default 200 |
| expected_body_match | text | nullable, optional keyword/JSON path assertion |
| headers | jsonb | nullable, custom headers/auth tokens |
| check_interval_seconds | int | default 300 |
| timeout_ms | int | default 10000 |
| retry_count | int | default 1 |
| hosting_provider | text | nullable |
| tags | text[] | nullable |
| is_active | boolean | default true |
| keep_alive_enabled | boolean | default false |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `checks`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK → projects) | |
| status | text | up / down / degraded / waking / unknown |
| http_status | int | nullable |
| response_time_ms | int | nullable |
| error_message | text | nullable |
| response_snippet | text | nullable, truncated body on failure |
| region | text | nullable, for multi-region probing |
| checked_at | timestamptz | |

### `incidents`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK → projects) | |
| started_at | timestamptz | |
| resolved_at | timestamptz | nullable |
| cause | text | nullable, auto or manually annotated |
| notified | boolean | default false |

### `checks_aggregated` (rollup table for retention)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK) | |
| period_start | timestamptz | |
| period_type | text | hourly / daily |
| uptime_percentage | numeric | |
| avg_response_time_ms | int | |
| total_checks | int | |
| total_failures | int | |

### `notification_channels`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| type | text | discord / email / webhook (telegram descoped, #42 — see §5.5) |
| config | jsonb | webhook URL, email address, etc. |
| is_active | boolean | |

### `project_notification_rules`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid (FK) | |
| channel_id | uuid (FK) | |
| escalation_threshold | int | consecutive failures before alert |
| digest_only | boolean | default false |

### `hosting_platforms` / `hosting_platform_tiers` (§5.11, Phase 12)
Seeded reference catalog (Vercel, Render, Railway, Appwrite, Fly.io, Other/Custom), each tier
carrying an approximate `free_quota_minutes_per_month` (nullable — paid/unbounded tiers, and
tiers whose real billing unit doesn't map to time, have no preset) plus `source_url`/
`verified_at` since free-tier numbers drift and need periodic re-verification. Not user-writable.

### `platform_accounts` (§5.11, Phase 12)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → auth.users) | owner |
| label | text | e.g. "My Render Account" |
| platform_id | uuid (FK → hosting_platforms) | |
| tier_id | uuid (FK → hosting_platform_tiers) | |
| quota_minutes_per_month | int | nullable, copied from tier preset, user-editable; null = unlimited/not tracked |
| assumed_ms_per_request | int | default 300 — converts a minute budget into a check interval |

### `projects` additions (§5.11, Phase 12)
| Column | Type | Notes |
|---|---|---|
| platform_account_id | uuid (FK → platform_accounts) | nullable; null = manual interval, as before this feature |
| budget_minutes_per_month | int | nullable, monitoring allocation against the account's pool |
| keep_alive_budget_minutes_per_month | int | nullable, keep-alive allocation |
| keep_alive_interval_minutes | int | default 10 (preserves pre-Phase-12 behavior); read by `get_due_keep_alive_projects()` instead of a hardcoded literal |

---

## 7. System Architecture

```
                        ┌─────────────────────────┐
                        │   Supabase Scheduled     │
                        │   Trigger / pg_cron      │
                        │  (fires every 1 min)     │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  Edge Function: prober    │
                        │  - loads due projects     │
                        │  - fires HTTP requests    │
                        │  - classifies status       │
                        │  - retries on failure       │
                        └────────────┬─────────────┘
                                     │
                     writes results ▼
                        ┌─────────────────────────┐
                        │   Postgres (Supabase)     │
                        │  projects / checks /       │
                        │  incidents / aggregates    │
                        └────────────┬─────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              ▼                                              ▼
   ┌─────────────────────┐                     ┌──────────────────────────┐
   │  Edge Function:       │                     │   Dashboard (Next.js/     │
   │  notifier             │                     │   Vite) — deployed on     │
   │  - incident detection │                     │   Vercel/Netlify           │
   │  - sends alerts        │                     │   - reads via Supabase      │
   │  (Discord/email/       │                     │     client SDK              │
   │   email/webhook)       │                     │   - public status pages     │
   └─────────────────────┘                     └──────────────────────────┘

   ┌───────────────────────────────────────────────────────────────────┐
   │  Monitored Projects (Render / Railway / App Platform / Vercel /     │
   │  Convex / etc.) — each exposes GET /health returning status info     │
   └───────────────────────────────────────────────────────────────────┘
```

---

## 8. Non-Functional Requirements

- **Reliability:** The prober itself must not become a single point of failure — Edge Function failures should be logged and retried on the next scheduled tick rather than silently dropped.
- **Performance:** Checks for all registered projects should complete well within the scheduling tick window (e.g., under 30s for up to ~50 projects) to avoid overlapping runs.
- **Cost:** Must operate within Supabase's free tier for the personal-use phase (mindful of Edge Function invocation limits, database row limits, and egress).
- **Data retention:** Raw check data should not grow unbounded; aggregation/rollup must run automatically.
- **Security:** Health check endpoints that expose internal details should support a shared-secret header so they aren't fully public/guessable; no secrets committed to the repo (`.env` based config).
- **Portability:** Core prober logic should not rely on Supabase-specific APIs beyond what's necessary, to ease future migration.
- **Observability:** Upkeep should be able to monitor its own health (meta-monitoring) — i.e., some way to know if the prober itself has stopped running (e.g., a "last successful run" timestamp visible on the dashboard, or a dead-man's-switch style external check).

---

## 9. Success Metrics

- 100% of registered personal/resume projects report a health status visible on the dashboard within one check interval of any state change.
- Zero manual dashboard visits to third-party hosting providers required to confirm a project's live status.
- Reduction (ideally elimination) of cold-start delays on demo links for projects with keep-alive enabled.
- Mean time to detect (MTTD) a real incident under 2x the configured check interval.
- Dashboard load time under 1s for the overview page with up to ~50 projects.

---

## 10. Open Questions

- ~~Preferred notification channel for v1 (Discord recommended for simplicity of webhook setup)?~~ **Decided (#41): Discord**, shipped and verified against a real webhook. Telegram (#42) descoped, see §5.5.
- Should keep-alive pinging run on a fixed schedule or attempt to learn each host's specific idle-timeout window automatically?
- ~~Retention window for raw `checks` data before rollup (7 days vs. 14 days)?~~ **Decided: 7 days.**
- Should the public status page be enabled per-project by default, or opt-in only?
- Naming/branding conventions to finalize before open-sourcing the repo.

---

## 11. Glossary

- **Health endpoint:** A lightweight HTTP route (e.g., `/health` or `/api/health`) on a monitored project that returns a simple status response, optionally with metadata (DB connectivity, uptime, version).
- **Prober:** The Edge Function responsible for executing scheduled health checks.
- **Cold start:** Delay experienced when a free-tier host wakes an idled service in response to incoming traffic.
- **Keep-alive:** Scheduled traffic sent specifically to prevent a service from idling/sleeping.
- **Incident:** A grouped sequence of failed/degraded checks representing a single continuous outage event.