// Check-type plugin contract and registry (PRD §5.2/§5.10, Phase 9,
// issue #70) -- the prober's analogue of the notifier's `dispatch.ts`
// (issue #40/#69): the interface every check type (http, tcp #55, dns
// #56, ssl #57) implements independently against, so `check.ts`'s
// `runHealthCheck`, `classify.ts`'s `classifyCheck`, and `retry.ts`'s
// attempt-success check never branch on `check_type` themselves -- adding
// a new check type is "write one module matching `CheckTypeModule` and
// register it below", not "add a new `if` branch inside three separate
// orchestration files".
//
// This audit (#70) found that claim did NOT already hold before this
// migration -- check.ts's `runHealthCheck`, classify.ts's `classifyCheck`,
// and retry.ts's `isAttemptSuccessful` each independently branched on
// `project.check_type` with their own `if`/`else` chain, unlike the
// notifier's `DISPATCHERS` map (#40), which already was a genuine
// registry lookup when #69 audited it. This file (plus http.ts/tcp.ts/
// dns.ts/ssl.ts) is the actual refactor that closes that gap -- not just
// documentation of an existing pattern.
//
// `DueProject`/`CheckResult` are defined here (not in check.ts, where they
// used to live) specifically so this module has zero import dependency on
// check.ts -- check.ts imports *from* here (for `CHECK_TYPES`), so the
// reverse would be a circular import. Every other module in this
// directory that previously imported these two types from `./check.ts`
// is unaffected: `check.ts` re-exports them from here unchanged, so their
// import path (`from "./check.ts"`) never needed to change anywhere else
// in this codebase.

/** The four check types the prober supports. Mirrors
 * `src/features/projects/constants/index.ts`'s own `CHECK_TYPES` on the
 * Next.js side (duplicated, not shared -- see check.ts's original
 * comment on why an Edge Function can't import across the app/Deno
 * boundary). */
export type CheckType = "http" | "tcp" | "dns" | "ssl";

/** The subset of a `projects` row this module needs. Kept minimal and
 * local rather than importing the Next.js app's generated Database type --
 * this Edge Function is a separate Deno runtime/module graph. */
export type DueProject = {
  id: string;
  health_url: string;
  method: string;
  headers: unknown;
  timeout_ms: number;
  body: string | null;
  retry_count: number;
  expected_status: number;
  check_type: CheckType;
  /** Rate-limit backoff (PRD §5.2, Phase 9, issue #61) -- `check_interval_seconds`
   * (already present on every `projects` row, just not previously needed by
   * this module) and `rate_limit_backoff_count` are what `rate-limit.ts`'s
   * `computeBackoffSeconds` needs to grow a project's next backoff window. */
  check_interval_seconds: number;
  rate_limit_backoff_count: number;
  /** Keyword/content match check (PRD §5.2, Phase 9, issue #58) --
   * `null`/empty means "not configured", preserving every existing
   * project's current behavior unchanged (#58's own acceptance
   * criterion). Only meaningful for `check_type = "http"`; the other
   * three check types have no response body to search at all. */
  expected_body_match: string | null;
  /** JSON path/value assertion (PRD §5.2, Phase 9, issue #59) -- both
   * null/empty means "not configured", same backward-compatibility
   * precedent as `expected_body_match` above. Only meaningful for
   * `check_type = "http"`. Requires *both* fields set to run -- a path
   * with no expected value (or vice versa) is treated as unconfigured
   * rather than guessing at intent. */
  expected_json_path: string | null;
  expected_json_value: string | null;
};

export type CheckResult = {
  project_id: string;
  http_status: number | null;
  response_time_ms: number;
  response_snippet: string | null;
  error_message: string | null;
  /** True only when the request was aborted for exceeding project.timeout_ms
   * -- a structured, machine-readable signal so classification can react to
   * "timed out" without parsing error_message text. Never true alongside a
   * successful response. */
  timed_out: boolean;
  /** How many attempts this result represents. Always 1 from a check
   * type's own `run` -- retry.ts overwrites this on the final result it
   * returns so callers can see whether a retry was needed (#23). */
  attempts: number;
  /** True only for `check_type = "ssl"` (#57): the certificate is currently
   * valid (`error_message` is null) but expires within ssl.ts's own
   * expiry-warning window. classify.ts's ssl branch uses this to produce
   * "degraded" instead of "up" without needing its own expiry math, since
   * `ssl.ts`'s `run` already parsed the certificate. Optional (not just
   * `false`) so every other check type/outcome can omit it entirely
   * rather than needing a field that means nothing for their type. */
  certExpiringSoon?: boolean;
  /** True only when `check_type = "http"` and `project.expected_body_match`
   * is set but the *full* (untruncated) response body doesn't contain it
   * (#58). Optional, same reasoning as `certExpiringSoon` above. Never
   * true when `expected_body_match` is unset, by construction (#58's own
   * backward-compatibility acceptance criterion). */
  bodyMatchFailed?: boolean;
  /** True only when `check_type = "http"` and both
   * `project.expected_json_path`/`expected_json_value` are set but the
   * assertion against the *full* response body failed -- invalid JSON, an
   * unresolvable path, or a value mismatch (#59). Optional, same
   * reasoning as `certExpiringSoon`/`bodyMatchFailed` above. */
  jsonAssertionFailed?: boolean;
  /** Human-readable reason for `jsonAssertionFailed` (parse error, missing
   * path, or value mismatch), surfaced through persist.ts into the
   * persisted `checks.error_message` column and from there into
   * incidents.ts's `deriveIncidentCause` (#59's own acceptance criterion).
   * Deliberately kept separate from this type's own `error_message` field,
   * which classification's "unknown" branch treats as "the check itself
   * couldn't execute" -- reusing it here would misclassify a successful-
   * response-but-failed-assertion check as `unknown` instead of `down`.
   * Always null/undefined when `jsonAssertionFailed` is false/undefined. */
  jsonAssertionError?: string | null;
};

export type CheckStatus = "up" | "down" | "degraded" | "waking" | "unknown";

/** The subset of a project's config classification needs. */
export type ClassifiableProject = {
  expected_status: number;
  check_type: CheckType;
};

/**
 * One check type's implementation: how to actually run the check, how to
 * classify its raw result into a `CheckStatus`, and whether one attempt
 * counts as successful for retry purposes. Bundling all three into a
 * single module (rather than three separate registries) keeps a check
 * type's own domain-specific rules -- e.g. "tcp is only ever up/down,
 * never degraded/waking" -- next to each other in one file instead of
 * spread across check.ts/classify.ts/retry.ts, each with their own copy
 * of the same `check_type` branch.
 *
 * Contract every implementation must follow:
 * - `run` must never throw -- a network error, timeout, non-2xx status,
 *   etc. are all reported as a `CheckResult` with `error_message`/
 *   `timed_out` set, not an exception, so one bad project can't take down
 *   a concurrent batch (see check.ts's `runHealthChecks`).
 * - `classify`/`isAttemptSuccessful` are pure -- no I/O, no `Deno`/network
 *   access, callable and unit-testable without an Edge Function
 *   invocation (same reasoning as the original single-file classify.ts).
 */
export type CheckTypeModule = {
  run(project: DueProject): Promise<CheckResult>;
  classify(result: CheckResult, project: ClassifiableProject): CheckStatus;
  isAttemptSuccessful(result: CheckResult, project: DueProject): boolean;
};

import { httpCheckType as http } from "./http.ts";
import { tcpCheckType as tcp } from "./tcp.ts";
import { dnsCheckType as dns } from "./dns.ts";
import { sslCheckType as ssl } from "./ssl.ts";

/** The full plugin registry -- check.ts/classify.ts/retry.ts all look up
 * a project's check type here and never need to know anything else about
 * how a given type actually runs/grades/retries. Adding a new check type
 * (#70's own proof-of-concept, see ADDING_A_CHECK_TYPE.md) means widening
 * `CheckType` above and adding one entry here -- nothing else in this
 * object's three consumers needs to change. */
export const CHECK_TYPES: Record<CheckType, CheckTypeModule> = {
  http,
  tcp,
  dns,
  ssl,
};
