// Unit tests for classify.ts (issue #24 AC: "pure function with
// unit-testable inputs/outputs... without hitting a real Edge Function
// invocation"). Run with `deno test` from this directory -- no Docker, no
// Supabase project, no network access required.
import { assertEquals } from "@std/assert";
import { classifyCheck, type ClassifiableProject } from "./classify.ts";
import type { CheckResult } from "./check.ts";

const project: ClassifiableProject = { expected_status: 200, check_type: "http" };
const tcpProject: ClassifiableProject = { expected_status: 200, check_type: "tcp" };

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
