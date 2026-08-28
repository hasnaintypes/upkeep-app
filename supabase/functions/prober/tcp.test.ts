// Unit tests for tcp.ts -- run(), classify(), and isAttemptSuccessful()
// for the TCP check type (#55). run()'s dispatch is tested against a
// stubbed `Deno.connect` (no real network access needed). Split out of
// the former check.test.ts/classify.test.ts as part of #70's plugin-
// architecture refactor.
import { assertEquals } from "@std/assert";
import { runTcpCheck, classifyTcp, isTcpAttemptSuccessful } from "./tcp.ts";
import type { CheckResult, DueProject } from "./check-types.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "db.example.com:5432",
    method: "GET",
    headers: null,
    timeout_ms: 200,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "tcp",
    check_interval_seconds: 300,
    rate_limit_backoff_count: 0,
    expected_body_match: null,
    expected_json_path: null,
    expected_json_value: null,
    ...overrides,
  };
}

function fakeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    project_id: "test-project",
    http_status: null,
    response_time_ms: 12,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

/** Temporarily replaces the global `Deno.connect` for the duration of `run`,
 * always restoring the original afterward even if `run` throws. */
async function withFakeConnect<T>(
  fakeConnect: typeof Deno.connect,
  run: () => Promise<T>,
): Promise<T> {
  const original = Deno.connect;
  Deno.connect = fakeConnect;
  try {
    return await run();
  } finally {
    Deno.connect = original;
  }
}

// --- runTcpCheck ------------------------------------------------------------

Deno.test("runTcpCheck: successful connect -> up-shaped result (no error, null http_status)", async () => {
  let closed = false;
  const result = await withFakeConnect(
    (() =>
      Promise.resolve({
        close: () => {
          closed = true;
        },
      })) as unknown as typeof Deno.connect,
    () => runTcpCheck(fakeProject()),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.response_snippet, null);
  assertEquals(closed, true);
});

Deno.test("runTcpCheck: connection refused -> error_message set, not timed_out", async () => {
  const result = await withFakeConnect(
    (() => Promise.reject(new Error("Connection refused"))) as unknown as typeof Deno.connect,
    () => runTcpCheck(fakeProject()),
  );

  assertEquals(result.error_message, "Connection refused");
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
});

Deno.test("runTcpCheck: connect never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeConnect(
    // Never resolves/rejects -- exactly the "silently dropped SYN packet"
    // case #55's acceptance criterion ("not a hung function invocation")
    // is guarding against. runTcpCheck's own timeout race (not this fake)
    // is what has to end the test in bounded time here.
    (() => new Promise(() => {})) as unknown as typeof Deno.connect,
    () => runTcpCheck(fakeProject({ timeout_ms: 50 })),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
  assertEquals(result.http_status, null);
});

Deno.test("runTcpCheck: invalid target -> error_message set, never throws", async () => {
  const result = await runTcpCheck(fakeProject({ health_url: "not-a-valid-target" }));

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'Invalid TCP target "not-a-valid-target" -- expected "host:port".',
  );
});

// --- classifyTcp -------------------------------------------------------------
// #55: only ever up/down, regardless of http_status (always null for a TCP
// result) or response_time_ms (no degraded/waking concept without a
// response body to have been slow to deliver).

Deno.test("classifyTcp: reachable within timeout -> up, even if slow", () => {
  assertEquals(classifyTcp(fakeResult({ response_time_ms: 9000 })), "up");
});

Deno.test("classifyTcp: connection refused -> down, not unknown", () => {
  assertEquals(
    classifyTcp(fakeResult({ error_message: "Connection refused" })),
    "down",
  );
});

Deno.test("classifyTcp: timed out -> down", () => {
  assertEquals(
    classifyTcp(
      fakeResult({ timed_out: true, error_message: "Timed out after 5000ms", response_time_ms: 5000 }),
    ),
    "down",
  );
});

// --- isTcpAttemptSuccessful ---------------------------------------------------

Deno.test("isTcpAttemptSuccessful: no error -> true", () => {
  assertEquals(isTcpAttemptSuccessful(fakeResult()), true);
});

Deno.test("isTcpAttemptSuccessful: error set -> false", () => {
  assertEquals(isTcpAttemptSuccessful(fakeResult({ error_message: "Connection refused" })), false);
});
