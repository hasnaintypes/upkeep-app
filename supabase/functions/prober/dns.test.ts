// Unit tests for dns.ts -- run(), classify(), and isAttemptSuccessful()
// for the DNS check type (#56). run()'s dispatch is tested against a
// stubbed `Deno.resolveDns` (no real network access needed). Split out of
// the former check.test.ts/classify.test.ts as part of #70's plugin-
// architecture refactor.
import { assertEquals } from "@std/assert";
import { runDnsCheck, classifyDns, isDnsAttemptSuccessful } from "./dns.ts";
import type { CheckResult, DueProject } from "./check-types.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "example.com",
    method: "GET",
    headers: null,
    timeout_ms: 200,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "dns",
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
    response_time_ms: 8,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

/** Same shape as tcp.test.ts's `withFakeConnect`, for `Deno.resolveDns` (#56). */
async function withFakeResolveDns<T>(
  fakeResolveDns: typeof Deno.resolveDns,
  run: () => Promise<T>,
): Promise<T> {
  const original = Deno.resolveDns;
  Deno.resolveDns = fakeResolveDns;
  try {
    return await run();
  } finally {
    Deno.resolveDns = original;
  }
}

// --- runDnsCheck -------------------------------------------------------------

Deno.test("runDnsCheck: successful resolution -> up-shaped result (no error, null http_status)", async () => {
  const result = await withFakeResolveDns(
    (() => Promise.resolve(["93.184.216.34"])) as unknown as typeof Deno.resolveDns,
    () => runDnsCheck(fakeProject()),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.response_snippet, null);
});

Deno.test("runDnsCheck: NXDOMAIN-style resolver error -> error_message set, not timed_out", async () => {
  const result = await withFakeResolveDns(
    (() =>
      Promise.reject(
        new Error('proto error: no records found for Query { name: Name("bad.invalid.") }'),
      )) as unknown as typeof Deno.resolveDns,
    () => runDnsCheck(fakeProject({ health_url: "bad.invalid" })),
  );

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'proto error: no records found for Query { name: Name("bad.invalid.") }',
  );
  assertEquals(result.http_status, null);
});

Deno.test("runDnsCheck: resolution never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeResolveDns(
    // Never resolves/rejects -- same "not a hung function invocation"
    // guard as the TCP timeout test. runDnsCheck's own timeout race (not
    // this fake) is what has to end the test in bounded time here.
    (() => new Promise(() => {})) as unknown as typeof Deno.resolveDns,
    () => runDnsCheck(fakeProject({ timeout_ms: 50 })),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
  assertEquals(result.http_status, null);
});

Deno.test("runDnsCheck: empty target -> error_message set, never throws", async () => {
  const result = await runDnsCheck(fakeProject({ health_url: "   " }));

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message, 'Invalid DNS target "   " -- expected a hostname.');
});

// --- classifyDns -------------------------------------------------------------
// #56: unlike tcp, keeps the timeout-vs-other-error split (down vs.
// unknown), but skips the HTTP-only http_status/degraded/waking rules.

Deno.test("classifyDns: resolved within timeout -> up, even if slow", () => {
  assertEquals(classifyDns(fakeResult({ response_time_ms: 9000 })), "up");
});

Deno.test("classifyDns: NXDOMAIN-style resolver error (not a timeout) -> unknown, not down", () => {
  assertEquals(
    classifyDns(fakeResult({ error_message: "proto error: no records found" })),
    "unknown",
  );
});

Deno.test("classifyDns: timed out -> down, not unknown", () => {
  assertEquals(
    classifyDns(
      fakeResult({ timed_out: true, error_message: "Timed out after 5000ms", response_time_ms: 5000 }),
    ),
    "down",
  );
});

// --- isDnsAttemptSuccessful ---------------------------------------------------

Deno.test("isDnsAttemptSuccessful: no error -> true", () => {
  assertEquals(isDnsAttemptSuccessful(fakeResult()), true);
});

Deno.test("isDnsAttemptSuccessful: error set -> false", () => {
  assertEquals(isDnsAttemptSuccessful(fakeResult({ error_message: "NXDOMAIN" })), false);
});
