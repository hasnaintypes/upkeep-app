# Generic outgoing webhook payload contract

Part of Phase 6 — Alerting & Notifications (PRD §5.5, issue #43). This document is the stable
contract for any `notification_channels` row of `type = "webhook"` — the source of truth is
[`webhook.ts`](./webhook.ts)'s `buildWebhookPayload` function; this file describes what it
produces for integrators who don't want to read Deno/TypeScript to wire up their own endpoint.

(Co-located with the code it documents, not under `docs/` — `docs/` in this repo is internal
planning material that's gitignored and never ships, see `AGENTS.md`; this contract is public
integration documentation for third parties and needs to actually be in the shipped repo.)

## When it's sent

Upkeep POSTs to your configured URL exactly twice per incident, never more:

1. **Once when an incident opens** — after N consecutive failing checks (PRD §5.4, `#35`).
2. **Once when that incident resolves** — after M consecutive successful checks (`#36`).

Nothing is sent on every individual check (PRD §5.5's "notification on status change only, to
avoid spam"), and nothing is sent for an incident whose channel/project notification rule is muted
or `digest_only` (see `#40`'s dispatch/eligibility rules).

## Request

```
POST <your configured url>
Content-Type: application/json
```

No signature/authentication header is sent today — treat your webhook URL itself as the secret
(most receivers, e.g. webhook.site or a serverless function with a random path segment, are
designed around exactly this model). If you need stronger verification, put a random, hard-to-guess
token in your own URL's path or query string and check for it server-side.

## Payload

### On incident open

```json
{
  "event": "incident.opened",
  "project": {
    "id": "3fbe2b0e-8c2b-4b8e-9b0e-6e4b8f0d6f9a",
    "name": "My API"
  },
  "incident": {
    "id": "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7",
    "started_at": "2026-08-25T10:00:00.000Z",
    "resolved_at": null,
    "duration_seconds": null,
    "cause": "connection timed out after 10000ms"
  },
  "sent_at": "2026-08-25T10:00:05.123Z"
}
```

### On incident resolve

```json
{
  "event": "incident.resolved",
  "project": {
    "id": "3fbe2b0e-8c2b-4b8e-9b0e-6e4b8f0d6f9a",
    "name": "My API"
  },
  "incident": {
    "id": "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7",
    "started_at": "2026-08-25T10:00:00.000Z",
    "resolved_at": "2026-08-25T10:12:30.000Z",
    "duration_seconds": 750,
    "cause": "connection timed out after 10000ms"
  },
  "sent_at": "2026-08-25T10:12:35.456Z"
}
```

### Field reference

| Field                        | Type              | Notes                                                                                        |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `event`                       | `string`           | `"incident.opened"` or `"incident.resolved"` — exactly one of these two values, always.        |
| `project.id`                  | `string` (UUID)    | Stable identifier for the monitored project.                                                   |
| `project.name`                | `string`           | Display name at the time this event was sent — may change later if the project is renamed.     |
| `incident.id`                 | `string` (UUID)    | Stable identifier for this specific incident — the same value across its open and resolve events. |
| `incident.started_at`         | `string` (ISO 8601)| When the incident began (the oldest of the consecutive failing checks that opened it).          |
| `incident.resolved_at`        | `string` (ISO 8601)| `null` on `incident.opened`; the resolve time on `incident.resolved`.                            |
| `incident.duration_seconds`   | `number`           | `null` on `incident.opened`; `resolved_at - started_at` in whole seconds on `incident.resolved`.|
| `incident.cause`               | `string \| null`   | A human-readable cause if one was recorded (auto-derived, `#35`, or manually annotated, `#37`) — `null` if none. |
| `sent_at`                      | `string` (ISO 8601)| When *this specific webhook request* was sent — not the same as `started_at`/`resolved_at`.     |

## Delivery guarantees

- **At-least-once, best-effort, no automatic retry within one delivery attempt.** If your endpoint
  is unreachable or returns a non-2xx status, Upkeep logs the failure and tries again automatically
  on its next scheduled run (every 1 minute) — but only until the very next run picks it up; a
  channel that's down for longer than that will simply miss that one notification once it starts
  responding again (see `#40`'s own "single best-effort attempt per transition" design note).
- **Respond quickly with any 2xx status.** Upkeep doesn't inspect your response body — only the
  HTTP status matters. Do your own processing asynchronously if it's slow.
- **No ordering guarantee across different incidents/projects**, though the open and resolve events
  for the *same* incident are always sent in that order (a resolve can't be detected before an open).

## Versioning

There is no `version` field in the payload yet — this is v1 of the contract. If a breaking change
is ever needed, a `version` field will be added rather than silently changing existing field
meanings.
