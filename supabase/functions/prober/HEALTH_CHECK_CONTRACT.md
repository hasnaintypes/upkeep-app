# Health-check endpoint contract

Part of Phase 11 — Extensibility & Open-Source Readiness (PRD §5.10, issue `#66`). This document
describes exactly what a project's health endpoint needs to return to be classified correctly by
Upkeep's prober, and every optional check type/assertion available. The source of truth is the
prober's own code — primarily [`classify.ts`](./classify.ts) (status classification) and
[`check.ts`](./check.ts) (request execution) — this file exists for integrators who want to wire
up their own project without reading Deno/TypeScript.

(Co-located with the code it documents, not under `docs/` — `docs/` in this repo is internal
planning material that's gitignored and never ships, see `AGENTS.md`; this contract is public
integration documentation and needs to actually be in the shipped repo, same convention as
[`../notifier/WEBHOOK_PAYLOAD.md`](../notifier/WEBHOOK_PAYLOAD.md).)

This describes the contract **as it actually ships today**, not a forward-looking design — every
number below is a literal constant in the code it cites.

## Check types

A project's `check_type` determines what its `health_url` (or, for three of the four types, a
`"host:port"`/hostname target — the column is overloaded, not renamed, for historical reasons) is
interpreted as, and what "success" means:

| `check_type` | `health_url` format | What's verified | Example |
| --- | --- | --- | --- |
| `http` (default) | Full URL | An HTTP request is made and graded (see below) | `https://your-app.example.com/health` |
| `tcp` | `host:port` | A TCP connection can be opened — no request is sent | `db.example.com:5432` |
| `dns` | Bare hostname (no scheme/port) | The hostname resolves to an `A` record | `example.com` |
| `ssl` | `host:port` | The server's TLS certificate is valid and not expiring soon — no request is sent | `example.com:443` |

Every check type shares the same `timeout_ms` (default `10000`, i.e. 10s; validated range
1000–120000) and the same five possible outcomes (`up`/`down`/`degraded`/`waking`/`unknown`), but
which outcomes are actually reachable, and what triggers each, differs per type — see
[Status classification](#status-classification) below.

## HTTP checks

The default and most common case. Upkeep sends:

```
<method> <health_url>
<your configured headers>

<your configured body, only for non-GET/HEAD methods>
```

- **`method`** — `GET` (default), `POST`, or `HEAD`.
- **Headers** — an arbitrary set of `name: value` pairs you configure per project. Upkeep has no
  built-in auth scheme of its own — put whatever your endpoint expects here, e.g.:

  ```json
  { "Authorization": "Bearer <your-token>", "X-Api-Key": "<your-key>" }
  ```
- **Body** — only ever sent for `POST` (never for `GET`/`HEAD`, which cannot carry one). Max 10,000
  characters.
- **Timeout** — the whole request (connection + full response body) must complete within
  `timeout_ms`, or it's treated as a timeout (see below) regardless of how much of the response,
  if any, had already streamed in. Timing stops after the body finishes reading, not right after
  headers arrive, so a slow-streaming response still counts as slow.

A minimal, correct health endpoint just needs to respond `200 OK` quickly:

```js
// Express
app.get("/health", (req, res) => res.sendStatus(200));
```

```python
# FastAPI
@app.get("/health")
def health():
    return {"status": "ok"}
```

```ts
// Next.js Route Handler (app/api/health/route.ts)
export async function GET() {
  return new Response(null, { status: 200 });
}
```

See [`HEALTH_CHECK_EXAMPLES.md`](./HEALTH_CHECK_EXAMPLES.md) for the same three stacks with a
verified, copy-pasteable JSON body wired up to this contract's `expected_json_path`/
`expected_json_value` assertion (below), instead of just a bare status code.

### What's graded, and in what order

Once a response arrives (or the request fails/times out), it's checked against your project's
configuration in this exact order — the first thing that doesn't match decides the outcome:

1. **`expected_status`** (default `200`, validated range 100–599) — the response's HTTP status
   code must match exactly. A `304` when you configured `200` is a mismatch, not a "close enough."
2. **`expected_body_match`** (optional) — if set, the *full* response body (not just what's
   captured in the check's stored `response_snippet`, which is truncated) must contain this exact
   substring, checked before response time is even considered. A matching status with a missing
   keyword is `down`, regardless of how fast the wrong response arrived. Example: set it to `"ok"`
   for an endpoint returning `{"status": "ok", "db": "connected"}`.
3. **`expected_json_path`/`expected_json_value`** (optional, both required together — see
   [JSON path assertion](#json-path-value-assertion) below) — same placement/reasoning as body
   match, just a stricter, structured check.
4. **Response time**, against two fixed thresholds (not configurable per project):
   - **> 7000ms** → `waking` (a cold-start signal, not a failure)
   - **> 3000ms** → `degraded`
   - otherwise → `up`

## Status classification

The five possible outcomes, and the exact condition that produces each — mirrors
[`classify.ts`](./classify.ts)'s `classifyCheck` function precisely:

| Status | Meaning | HTTP | TCP | DNS | SSL |
| --- | --- | --- | --- | --- | --- |
| `up` | Healthy | Status/body/JSON assertions all pass, response time ≤ 3000ms | Connection opened successfully | Hostname resolved | Certificate valid, not expiring within 14 days |
| `degraded` | Reachable but slow / needs attention | Status/body/JSON assertions all pass, response time > 3000ms and ≤ 7000ms | *(never produced)* | *(never produced)* | Certificate valid but expires within 14 days |
| `waking` | Cold-start signal | Status/body/JSON assertions all pass, response time > 7000ms | *(never produced)* | *(never produced)* | *(never produced)* |
| `down` | Unhealthy | Timed out, or status/body/JSON assertion mismatch | Connection failed or timed out | Resolution timed out | Timed out, connection failed, or certificate expired/not-yet-valid/self-signed |
| `unknown` | Couldn't complete the check | The request failed before getting *any* response (DNS failure, connection refused, TLS error) and it wasn't a timeout | *(never produced — a TCP check is only ever `up` or `down`)* | Resolver error (e.g. NXDOMAIN/SERVFAIL) that wasn't a timeout | *(never produced — SSL checks are only ever `up`/`degraded`/`down`)* |

A few things worth calling out explicitly:

- **`waking` only ever means "got a successful response, just a slow one."** A true timeout
  (nothing came back at all within `timeout_ms`) is always `down`, never `waking` — `timeout_ms`
  is already sized generously enough to tolerate a normal cold start, so exceeding it entirely is
  treated as an outage, not a slow wake-up.
- **`unknown` vs. `down` for a failed HTTP request**: if the request never got as far as an HTTP
  response — DNS failure, connection refused, TLS handshake error — and it wasn't our own timeout,
  that's `unknown` (something about the network/DNS path is broken, worth investigating
  differently from "the app itself returned the wrong thing"). If it *did* time out, that's `down`.
- **A TCP check is only ever `up` or `down`** — there's no response body or timing-quality signal
  to grade a successful connection against, so "slow but reachable" isn't a distinct TCP outcome.
- **An SSL check is only ever `up`, `degraded`, or `down`** — no `unknown`: any failure (timeout,
  connection error, invalid certificate) is `down`.
- **A DNS check is `up`, `down`, or `unknown`** — no `degraded`/`waking` (nothing to grade beyond
  "did it resolve").

### Retries

Before a failing attempt is finalized, it's retried up to `retry_count` additional times (so total
attempts = `1 + retry_count`; default `retry_count` is `1`, i.e. 2 total attempts), with a fixed
1-second delay between attempts — not exponential backoff, deliberately, since this exists purely
to absorb a transient blip or cold start, not as a resilience strategy for a persistently degraded
endpoint. "Success," for retry purposes only, means the status matched `expected_status` with no
error (body/JSON assertions and response-time thresholds aren't considered at this stage — they're
graded once by `classify.ts` against whichever attempt is the final one). The very first successful
attempt stops the retry loop immediately; if every attempt fails, the *last* attempt's result
(not the first) is what gets classified and stored, since it's the most current picture of the
endpoint's state.

## TCP checks

Set `check_type` to `tcp` and `health_url` to `"host:port"` (e.g. `db.example.com:5432`). Upkeep
attempts to open a raw TCP connection and closes it immediately on success — no data is sent or
read. `up` means the connection opened within `timeout_ms`; anything else (connection refused,
timeout, an unparseable target) is `down`.

## DNS checks

Set `check_type` to `dns` and `health_url` to a bare hostname, no scheme or port (e.g.
`example.com`). Upkeep resolves it as an `A` (IPv4) record only — an `AAAA`-only hostname will be
misreported as unresolvable. `up` means resolution succeeded within `timeout_ms`; a timeout is
`down`; a resolver error that wasn't a timeout (e.g. NXDOMAIN) is `unknown`.

## SSL/TLS certificate checks

Set `check_type` to `ssl` and `health_url` to `"host:port"` (e.g. `example.com:443`). Upkeep
connects and inspects the server's leaf (first) certificate:

- Expired, not-yet-valid, or self-signed → `down`.
- Valid, and expiring in **14 days or fewer** → `degraded` (the exact expiry date and days
  remaining are captured on the check record).
- Valid and not expiring soon → `up`.

**Scope boundary** (by design, not an oversight): this only checks the certificate's own
expiry/self-signed status. It does **not** validate the certificate's signature chain up to a
trusted root CA, and does **not** check for a hostname mismatch — a certificate signed by a real
but untrusted CA, or issued for the wrong hostname, will not be caught by this check type.

## Keyword/content match (`expected_body_match`)

An optional, simple substring check against the full HTTP response body — set it if `expected_status`
alone isn't a strong enough signal (e.g. a load balancer returning `200` with a generic error page
during a partial outage). Checked as a plain `body.includes(...)`, not a regex.

Example: your endpoint returns

```json
{ "status": "ok", "db": "connected" }
```

Set `expected_body_match` to `"ok"` (or `"connected"`, or any substring you want present) — a
`200` response missing that text classifies as `down`, not `up`.

## JSON path/value assertion (`expected_json_path` + `expected_json_value`)

A stricter, structured sibling of the keyword match above — instead of "the body contains this
text somewhere," "the value at this exact JSON path equals this exact value." Both fields are
required together; setting only one is treated as not configured at all.

**Path syntax** — a minimal dot/bracket walker, deliberately **not** full JSONPath (RFC 9535): no
wildcards, filters, slices, or recursive descent. Supported forms:

- `$` — the whole body (bare root).
- `$.field` — an object property.
- `$.parent.child` — nested properties.
- `$.items[0]` — a zero-based array index.
- Any combination, e.g. `$.data.items[0].status`.

**Comparison** is string-based (via `String(value)`), not deep-equal — it covers every JSON scalar
(string, number, boolean, `null`, compared as `"null"`) but not objects/arrays, which always fail
the assertion (there's no whole-sub-object comparison in v1).

Example: your endpoint returns

```json
{ "status": "ok", "data": { "items": [{ "code": 42 }] } }
```

| `expected_json_path` | `expected_json_value` | Result |
| --- | --- | --- |
| `$.status` | `"ok"` | Passes |
| `$.data.items[0].code` | `"42"` | Passes (numeric `42` compared as the string `"42"`) |
| `$.status` | `"degraded"` | Fails — `down`, with the mismatch captured on the check's error message |
| `$.nonexistent` | anything | Fails — path not found |

A non-JSON response body, or an invalid path syntax, both fail the assertion the same way a value
mismatch does — the specific reason (parse error, path not found, invalid syntax, or value
mismatch) is captured on the check record either way.

## Multi-region probing

If your Upkeep instance has multi-region probing enabled, every check is fired from three fixed
regions concurrently (not per-project configurable). A region's individual result only escalates
the overall round's status to `down` if **more than half** of the regions that actually responded
(excluding any region whose own infrastructure failed to probe at all) report `down` — a single
region seeing a blip doesn't take the whole project down. If every region fails to probe at all,
the round's status is `unknown`, not `down`. This only affects how `down` specifically is decided;
every other status (`up`/`degraded`/`waking`/`unknown`) passes through from whichever region
responded, unmodified.

## Rate-limit backoff

If your endpoint responds `429`, it's still classified as a plain `down` (no special "rate
limited" status) — but Upkeep automatically backs off its own polling: each consecutive `429`
doubles the wait before the next attempt (starting from your project's own `check_interval_seconds`,
capped at 1 hour), so Upkeep's own traffic doesn't make the situation worse. The backoff resets
the moment a check comes back without a `429`. This is purely a scheduling behavior — it never
changes what status gets stored.

## Keep-alive pings

Separate from monitoring entirely — if enabled, Upkeep pings your endpoint every 10 minutes
(optionally restricted to a daily time window you configure) purely to prevent a free-tier host
from idling out. A keep-alive ping never writes a check result and can never itself open or
resolve an incident, regardless of whether it succeeds — it shares your project's method/headers/
body/timeout configuration, but that's the only thing it has in common with real monitoring.

## Configuring these fields today

Every field described above is a real, working column read by the prober. As of this writing, the
dashboard's project form exposes check type, method, body, `expected_status`, headers, interval,
timeout, and keep-alive settings — but **not** `retry_count`, `expected_body_match`,
`expected_json_path`, or `expected_json_value` (every project currently runs with the database
default `retry_count` of `1`, and without a body/JSON assertion, until a UI for those four fields
ships). Until then, they can be set directly via `pnpm supabase db query --linked` against your own
project row, or a direct update through the Supabase dashboard's table editor.

## Versioning

This contract has no explicit version number — it's a description of the prober's current
behavior, kept in sync with the code that implements it. If a future change alters an existing
outcome (e.g. moving the `degraded`/`waking` thresholds), it'll be called out in the project's
changelog/README rather than silently changing this document's meaning out from under an existing
integration.
