// HTTP check type (PRD §5.2, Phase 3, issues #21-#22; keyword/content
// match, Phase 9, issue #58; JSON path/value assertion, Phase 9, issue
// #59) -- the original, default `check_type` and the only one with a
// response body/status to grade beyond plain reachability, so it's the
// only type with `degraded`/`waking` outcomes or body/JSON assertions.
//
// Bundles the three responsibilities every `CheckTypeModule` needs
// (`run`/`classify`/`isAttemptSuccessful`) for this one check type,
// following #70's audit/refactor -- see check-types.ts's own top comment
// for why these three were previously scattered across check.ts/
// classify.ts/retry.ts as per-check-type `if` branches instead of living
// together here.
import { evaluateJsonAssertion } from "./json-path.ts";
import type {
  CheckResult,
  CheckStatus,
  CheckTypeModule,
  ClassifiableProject,
  DueProject,
} from "./check-types.ts";

/** Matches the `checks.response_snippet` column's intended use (PRD §6) --
 * captured for later status classification (e.g. `expected_body_match`),
 * not stored in full to keep row sizes bounded. */
const RESPONSE_SNIPPET_MAX_LENGTH = 2000;

/** Response time above which an otherwise-successful check counts as
 * "waking" (cold-start signal) rather than merely "degraded". Thresholds
 * are the Phase 3 readiness-checklist decision recorded in
 * docs/ROADMAP.md -- not invented ad hoc here. If they ever need to
 * change, update the roadmap entry and this file together so they can't
 * drift apart. */
export const WAKING_THRESHOLD_MS = 7000;

/** Response time above which an otherwise-successful check counts as
 * "degraded" rather than "up". */
export const DEGRADED_THRESHOLD_MS = 3000;

function toHeaderRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Fires one health-check HTTP request and captures its raw result. Never
 * throws -- every failure mode (network error, timeout, non-2xx status)
 * resolves to a CheckResult with `error_message` set instead, so a single
 * bad project can't take down a concurrent batch (see check.ts's
 * `runHealthChecks`).
 */
export async function runHttpCheck(project: DueProject): Promise<CheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), project.timeout_ms);
  const startedAt = performance.now();

  try {
    const response = await fetch(project.health_url, {
      method: project.method,
      headers: toHeaderRecord(project.headers),
      // GET/HEAD requests must not carry a body -- fetch() throws
      // ("Request with GET/HEAD method cannot have body") if you try, so
      // this is only included for methods that actually support one.
      ...(project.method !== "GET" && project.method !== "HEAD" && project.body
        ? { body: project.body }
        : {}),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    // Timing intentionally stops after reading the body, not right after
    // headers arrive -- a slow-streaming response is still a slow check.
    const responseTimeMs = Math.round(performance.now() - startedAt);
    // Checked against the *full* `bodyText`, not the truncated
    // `response_snippet` below (#58) -- a match string past
    // RESPONSE_SNIPPET_MAX_LENGTH would otherwise be wrongly reported as
    // missing. `!project.expected_body_match` (unset/empty) always
    // resolves to `false` here, matching #58's own backward-compatibility
    // acceptance criterion.
    const bodyMatchFailed = project.expected_body_match
      ? !bodyText.includes(project.expected_body_match)
      : false;

    // Checked against the *full* `bodyText`, same reasoning as
    // `bodyMatchFailed` above (#59). Both `expected_json_path` and
    // `expected_json_value` must be set to run the assertion at all.
    const jsonAssertion =
      project.expected_json_path && project.expected_json_value !== null
        ? evaluateJsonAssertion(bodyText, project.expected_json_path, project.expected_json_value)
        : null;

    return {
      project_id: project.id,
      http_status: response.status,
      response_time_ms: responseTimeMs,
      response_snippet: bodyText.slice(0, RESPONSE_SNIPPET_MAX_LENGTH) || null,
      error_message: null,
      timed_out: false,
      attempts: 1,
      bodyMatchFailed,
      jsonAssertionFailed: jsonAssertion?.failed ?? false,
      jsonAssertionError: jsonAssertion?.failed ? jsonAssertion.message : null,
    };
  } catch (err) {
    const responseTimeMs = Math.round(performance.now() - startedAt);
    // AbortError is exactly and only what our own timeout abort() produces
    // here (no other abort trigger exists in this function), so it's a
    // reliable signal that this specific failure was a timeout, not some
    // other network error (DNS failure, connection refused, TLS error, etc).
    const isTimeout = err instanceof Error && err.name === "AbortError";

    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: isTimeout
        ? `Timed out after ${project.timeout_ms}ms`
        : err instanceof Error
          ? err.message
          : "Unknown error",
      timed_out: isTimeout,
      attempts: 1,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Classifies an HTTP check's raw result. Decision order: connection-level
 * error (not timeout) -> `unknown`; timeout -> `down`; status mismatch ->
 * `down`; body-match failure (#58) -> `down`; JSON assertion failure (#59)
 * -> `down`; response_time > WAKING_THRESHOLD_MS -> `waking`; >
 * DEGRADED_THRESHOLD_MS -> `degraded`; else `up`.
 */
export function classifyHttp(result: CheckResult, project: ClassifiableProject): CheckStatus {
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
  // page during a partial outage.
  if (result.bodyMatchFailed) {
    return "down";
  }

  // Matching status, but the configured JSON path assertion failed --
  // invalid JSON, an unresolvable path, or a value mismatch (#59).
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

/** Whether one HTTP attempt counts as successful for retry-decision
 * purposes -- a narrower judgment than `classifyHttp` above (no
 * response-time grading, no #58/#59 assertions): just "no error, and the
 * status matched". A status-matching-but-wrong-body/JSON response counts
 * as a "successful attempt" here (no retry triggered); `classifyHttp`
 * alone decides it's actually `down`. */
export function isHttpAttemptSuccessful(result: CheckResult, project: DueProject): boolean {
  return result.error_message === null && result.http_status === project.expected_status;
}

export const httpCheckType: CheckTypeModule = {
  run: runHttpCheck,
  classify: classifyHttp,
  isAttemptSuccessful: isHttpAttemptSuccessful,
};
