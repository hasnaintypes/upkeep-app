// Unit tests for classify.ts (issue #24 AC: "pure function with
// unit-testable inputs/outputs... without hitting a real Edge Function
// invocation"). Run with `deno test` from this directory -- no Docker, no
// Supabase project, no network access required.
import { assertEquals } from "@std/assert";
import { classifyCheck, type ClassifiableProject } from "./classify.ts";
import type { CheckResult } from "./check.ts";

const project: ClassifiableProject = { expected_status: 200, check_type: "http" };
const tcpProject: ClassifiableProject = { expected_status: 200, check_type: "tcp" };
const dnsProject: ClassifiableProject = { expected_status: 200, check_type: "dns" };
const sslProject: ClassifiableProject = { expected_status: 200, check_type: "ssl" };

function result(overrides: Partial<CheckResult>): CheckResult {
  return {
    project_id: "test-project",
    http_status: 200,
    response_time_ms: 100,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

Deno.test("classifyCheck: fast, matching status -> up", () => {
  assertEquals(
    classifyCheck(result({ response_time_ms: 250 }), project),
    "up",
  );
});

Deno.test("classifyCheck: exactly at the degraded threshold -> up (not yet degraded)", () => {
  assertEquals(
    classifyCheck(result({ response_time_ms: 3000 }), project),
    "up",
  );
});

Deno.test("classifyCheck: just over the degraded threshold -> degraded", () => {
  assertEquals(
    classifyCheck(result({ response_time_ms: 3001 }), project),
    "degraded",
  );
});

Deno.test("classifyCheck: exactly at the waking threshold -> degraded (not yet waking)", () => {
  assertEquals(
    classifyCheck(result({ response_time_ms: 7000 }), project),
    "degraded",
  );
});

Deno.test("classifyCheck: just over the waking threshold -> waking", () => {
  assertEquals(
    classifyCheck(result({ response_time_ms: 7001 }), project),
    "waking",
  );
});

Deno.test("classifyCheck: wrong http_status (fast, no error) -> down, not up", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: 500, response_time_ms: 50 }),
      project,
    ),
    "down",
  );
});

Deno.test("classifyCheck: timed out -> down, not waking or unknown", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: true,
        error_message: "Timed out after 10000ms",
        response_time_ms: 10002,
      }),
      project,
    ),
    "down",
  );
});

Deno.test("classifyCheck: DNS/network error (not a timeout) -> unknown, not down", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: false,
        error_message: "dns error: failed to lookup address information",
        response_time_ms: 4,
      }),
      project,
    ),
    "unknown",
  );
});

Deno.test("classifyCheck: a slow response that still matches expected_status is never unknown or down", () => {
  const status = classifyCheck(
    result({ response_time_ms: 9000 }),
    project,
  );
  assertEquals(status, "waking");
});

// #58: expected_body_match -- a matching status with the wrong body is
// `down`, regardless of response time (checked before the degraded/waking
// thresholds, since a wrong-content response isn't "successful but slow").
Deno.test("classifyCheck: bodyMatchFailed true, matching status -> down, even though status matched", () => {
  assertEquals(
    classifyCheck(result({ bodyMatchFailed: true }), project),
    "down",
  );
});

Deno.test("classifyCheck: bodyMatchFailed true takes priority over an otherwise-fast/matching response", () => {
  assertEquals(
    classifyCheck(result({ bodyMatchFailed: true, response_time_ms: 10 }), project),
    "down",
  );
});

Deno.test("classifyCheck: bodyMatchFailed false (or unset) -> normal classification, unaffected (#58 backward-compat AC)", () => {
  assertEquals(
    classifyCheck(result({ bodyMatchFailed: false, response_time_ms: 250 }), project),
    "up",
  );
  assertEquals(
    classifyCheck(result({ response_time_ms: 250 }), project), // bodyMatchFailed omitted entirely
    "up",
  );
});

Deno.test("classifyCheck: wrong http_status takes priority over bodyMatchFailed (both down, but for the reported reason to make sense)", () => {
  assertEquals(
    classifyCheck(result({ http_status: 500, bodyMatchFailed: true }), project),
    "down",
  );
});

// #59: expected_json_path/expected_json_value -- a matching status with a
// failed JSON path/value assertion is `down`, same placement/priority as
// #58's bodyMatchFailed above.
Deno.test("classifyCheck: jsonAssertionFailed true, matching status -> down, even though status matched", () => {
  assertEquals(
    classifyCheck(result({ jsonAssertionFailed: true }), project),
    "down",
  );
});

Deno.test("classifyCheck: jsonAssertionFailed true takes priority over an otherwise-fast/matching response", () => {
  assertEquals(
    classifyCheck(result({ jsonAssertionFailed: true, response_time_ms: 10 }), project),
    "down",
  );
});

Deno.test("classifyCheck: jsonAssertionFailed false (or unset) -> normal classification, unaffected (#59 backward-compat AC)", () => {
  assertEquals(
    classifyCheck(result({ jsonAssertionFailed: false, response_time_ms: 250 }), project),
    "up",
  );
  assertEquals(
    classifyCheck(result({ response_time_ms: 250 }), project), // jsonAssertionFailed omitted entirely
    "up",
  );
});

Deno.test("classifyCheck: wrong http_status takes priority over jsonAssertionFailed (both down, but for the reported reason to make sense)", () => {
  assertEquals(
    classifyCheck(result({ http_status: 500, jsonAssertionFailed: true }), project),
    "down",
  );
});

// #55: check_type = "tcp" -- only ever up/down, regardless of http_status
// (always null for a TCP result) or response_time_ms (no degraded/waking
// concept without a response body to have been slow to deliver).
Deno.test("classifyCheck: tcp, reachable within timeout -> up, even if slow", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: null, response_time_ms: 9000 }),
      tcpProject,
    ),
    "up",
  );
});

Deno.test("classifyCheck: tcp, connection refused -> down, not unknown", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: false,
        error_message: "Connection refused",
        response_time_ms: 12,
      }),
      tcpProject,
    ),
    "down",
  );
});

Deno.test("classifyCheck: tcp, timed out -> down", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: true,
        error_message: "Timed out after 5000ms",
        response_time_ms: 5000,
      }),
      tcpProject,
    ),
    "down",
  );
});

// #56: check_type = "dns" -- unlike tcp, keeps the timeout-vs-other-error
// split (down vs. unknown), per this issue's own task description asking
// for "the same error-vs-failure distinction the classifier already uses
// for HTTP checks" -- but skips the HTTP-only http_status/degraded/waking
// rules, since a bare resolution has no status/body to grade.
Deno.test("classifyCheck: dns, resolved within timeout -> up, even if slow", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: null, response_time_ms: 9000 }),
      dnsProject,
    ),
    "up",
  );
});

Deno.test("classifyCheck: dns, NXDOMAIN-style resolver error (not a timeout) -> unknown, not down", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: false,
        error_message: "proto error: no records found",
        response_time_ms: 8,
      }),
      dnsProject,
    ),
    "unknown",
  );
});

Deno.test("classifyCheck: dns, timed out -> down, not unknown", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: true,
        error_message: "Timed out after 5000ms",
        response_time_ms: 5000,
      }),
      dnsProject,
    ),
    "down",
  );
});

// #57: check_type = "ssl" -- only three outcomes (up/degraded/down), no
// "unknown" at all, per this issue's own acceptance criteria. Any failure
// (connection error, timeout, or an invalid/expired certificate -- all of
// which runSslCheck surfaces as a plain error_message, see check.ts) is
// `down`; a valid-but-expiring-soon certificate (result.certExpiringSoon,
// computed by runSslCheck itself) is `degraded`; otherwise `up`.
Deno.test("classifyCheck: ssl, valid certificate not expiring soon -> up", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: null, certExpiringSoon: false }),
      sslProject,
    ),
    "up",
  );
});

Deno.test("classifyCheck: ssl, valid certificate expiring within the warning window -> degraded, not down", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: null, certExpiringSoon: true }),
      sslProject,
    ),
    "degraded",
  );
});

Deno.test("classifyCheck: ssl, invalid/expired certificate -> down", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        error_message: "Certificate error: DEPTH_ZERO_SELF_SIGNED_CERT",
      }),
      sslProject,
    ),
    "down",
  );
});

Deno.test("classifyCheck: ssl, connection-level error -> down, not unknown", () => {
  assertEquals(
    classifyCheck(
      result({ http_status: null, error_message: "Connection refused" }),
      sslProject,
    ),
    "down",
  );
});

Deno.test("classifyCheck: ssl, timed out -> down", () => {
  assertEquals(
    classifyCheck(
      result({
        http_status: null,
        timed_out: true,
        error_message: "Timed out after 5000ms",
      }),
      sslProject,
    ),
    "down",
  );
});
