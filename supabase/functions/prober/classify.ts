// Status classification (PRD §5.2, Phase 3, issue #24; TCP check type,
// Phase 9, issue #55; DNS check type, Phase 9, issue #56; keyword/content
// match, Phase 9, issue #58; JSON path/value assertion, Phase 9, issue
// #59): maps a check's raw outcome to one of up/down/degraded/waking/
// unknown.
//
// Thresholds are the Phase 3 readiness-checklist decision recorded in
// docs/ROADMAP.md -- not invented ad hoc here. If they ever need to change,
// update the roadmap entry and this file together so they can't drift apart.
//
// #58's `expected_body_match` check (see `result.bodyMatchFailed`, computed
// by check.ts's `runHttpCheck` against the *full* response body, not the
// truncated `response_snippet`) is checked right after the `expected_status`
// match, before the response-time thresholds -- a matching status with the
// wrong body is `down` regardless of how fast the (wrong) response arrived,
// per this issue's own acceptance criterion ("a matching status with a
// missing/wrong body should classify as down, not up").
//
// #59's `expected_json_path`/`expected_json_value` assertion (see
// `result.jsonAssertionFailed`, computed by the same `runHttpCheck` call)
// is checked right alongside #58's `bodyMatchFailed`, same placement and
// same reasoning -- a matching status with an invalid-JSON/missing-path/
// mismatched-value body is `down` too. `runHttpCheck` deliberately leaves
// this type's own `error_message` field null on an assertion failure
// (same as `bodyMatchFailed`) and instead carries the specific mismatch/
// parse-error text on a separate `jsonAssertionError` field, precisely so
// it can never spuriously trip the generic `error_message`-based
// "unknown" branch below -- persist.ts (not this function) is what
// surfaces `jsonAssertionError` into the persisted `checks.error_message`
// column, satisfying #59's own acceptance criterion without this
// classifier needing to know that detail exists.
//
// #55's `check_type === "tcp"` branch is handled first and separately
// (see below) rather than folded into the HTTP-oriented rules underneath:
// a bare TCP check has no response body/status/timing-quality signal to
// grade the way an HTTP response does, so it only ever produces "up" or
// "down" -- never "degraded"/"waking" (no successful-but-slow concept
// without a body to have been slow to deliver) and never "unknown" either
// (unlike HTTP, there's no separate "reached the host but got a
// surprising app-level response" case for a bare TCP check to distinguish
// from "couldn't reach it at all" -- for TCP, failing to connect *is* the
// down signal, full stop; see this issue's own acceptance criterion:
// "An unreachable host:port produces a down check").
//
// #56's `check_type === "dns"` branch is different from TCP's: the issue's
// own task description explicitly asks for "down/unknown on resolution
// failure per the same error-vs-failure distinction the classifier
// already uses for HTTP checks" -- so unlike TCP, a DNS check keeps the
// timeout-vs-other-error split (a timed-out resolution is `down`; an
// NXDOMAIN/SERVFAIL-style resolver error that wasn't a timeout is
// `unknown`, not `down`, mirroring the exact reasoning the HTTP branch
// below already uses for "the check itself couldn't execute"). It only
// skips the HTTP-only rules that don't apply to a bare resolution (no
// `http_status` to compare against `expected_status`, no response-time
// degraded/waking grading).
//
// #57's `check_type === "ssl"` branch is simpler than either -- its own
// acceptance criteria define exactly three outcomes (up/degraded/down),
// no "unknown" at all: any failure (connection error, timeout, an
// expired/invalid certificate) is `down`; a valid certificate expiring
// within `check.ts`'s `SSL_EXPIRY_WARNING_DAYS` is `degraded` (a heads-up,
// not treated identically to a hard outage, per this issue's own task
// description); otherwise `up`. `result.certExpiringSoon` is computed by
// `runSslCheck` itself (which already parsed the certificate), not
// recomputed here.

import type { CheckResult, CheckType } from "./check.ts";

export type CheckStatus = "up" | "down" | "degraded" | "waking" | "unknown";

/** Response time above which an otherwise-successful check counts as
 * "waking" (cold-start signal) rather than merely "degraded". */
export const WAKING_THRESHOLD_MS = 7000;

/** Response time above which an otherwise-successful check counts as
 * "degraded" rather than "up". */
export const DEGRADED_THRESHOLD_MS = 3000;

/** The subset of a project's config the classifier needs. */
export type ClassifiableProject = {
  expected_status: number;
  check_type: CheckType;
};

/**
 * Pure function: raw check outcome + the project's expectation in, one of
 * the five status values out. No I/O, no Supabase/Deno globals -- callable
 * and unit-testable (see classify.test.ts) without an Edge Function
 * invocation.
 */
export function classifyCheck(
  result: CheckResult,
  project: ClassifiableProject,
): CheckStatus {
  if (project.check_type === "tcp") {
    return result.error_message === null ? "up" : "down";
  }

  if (project.check_type === "dns") {
    if (result.error_message !== null && !result.timed_out) {
      return "unknown";
    }
    if (result.timed_out) {
      return "down";
    }
    return "up";
  }

  if (project.check_type === "ssl") {
    if (result.error_message !== null) {
      return "down";
    }
    return result.certExpiringSoon ? "degraded" : "up";
  }

  // Never got as far as an HTTP response, and it wasn't our own timeout
  // abort -- DNS failure, connection refused, TLS error, etc. The check
  // itself couldn't execute, which is a different (and generally more
  // actionable-as-"investigate the network/DNS", not "the app is down")
  // situation than a completed-but-wrong response.
  if (result.error_message !== null && !result.timed_out) {
    return "unknown";
  }

  // Exceeded the project's own (deliberately generous, per PRD §5.2)
  // timeout_ms without ever completing. Treated as `down`, not `waking`:
  // `waking` specifically means we DID get a successful response, just a
  // slow one -- a true timeout means no response arrived at all within a
  // window that's already sized to tolerate normal cold starts.
  if (result.timed_out) {
    return "down";
  }

  // Got a response, but not the one configured as correct.
  if (result.http_status !== project.expected_status) {
    return "down";
  }

  // Matching status, but the configured keyword/string isn't in the body
  // (#58) -- e.g. a health endpoint returning 200 with a generic error
  // page during a partial outage. Always `false`/`undefined` when
  // `expected_body_match` isn't configured (see check.ts), so this is a
  // no-op for every project that predates #58.
  if (result.bodyMatchFailed) {
    return "down";
  }

  // Matching status, but the configured JSON path assertion failed --
  // invalid JSON, an unresolvable path, or a value mismatch (#59). Always
  // `false`/`undefined` when `expected_json_path`/`expected_json_value`
  // aren't both configured (see check.ts), so this is a no-op for every
  // project that predates #59.
  if (result.jsonAssertionFailed) {
    return "down";
  }

  if (result.response_time_ms > WAKING_THRESHOLD_MS) {
    return "waking";
  }
  if (result.response_time_ms > DEGRADED_THRESHOLD_MS) {
    return "degraded";
  }
  return "up";
}
