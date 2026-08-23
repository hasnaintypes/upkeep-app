// Status classification (PRD §5.2, Phase 3, issue #24): maps a check's raw
// outcome to one of up/down/degraded/waking/unknown.
//
// Thresholds are the Phase 3 readiness-checklist decision recorded in
// docs/ROADMAP.md -- not invented ad hoc here. If they ever need to change,
// update the roadmap entry and this file together so they can't drift apart.
//
// Deliberately excludes `expected_body_match` (keyword/JSON-path assertion
// against the response body) -- that's PRD §5.2's "additional check types"
// list, tracked as its own Phase 9 roadmap task, not part of this basic
// five-way classification.

import type { CheckResult } from "./check.ts";

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

  if (result.response_time_ms > WAKING_THRESHOLD_MS) {
    return "waking";
  }
  if (result.response_time_ms > DEGRADED_THRESHOLD_MS) {
    return "degraded";
  }
  return "up";
}
