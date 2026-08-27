// Unit tests for rate-limit.ts, using a fake BackoffClient that records what
// would have been updated -- no real Supabase project needed.
import { assertEquals } from "@std/assert";
import {
  applyRateLimitBackoff,
  computeBackoffSeconds,
  isRateLimited,
  MAX_BACKOFF_SECONDS,
  type BackoffClient,
  type BackoffProject,
} from "./rate-limit.ts";
import type { CheckResult } from "./check.ts";

function fakeResult(overrides: Partial<CheckResult>): CheckResult {
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

Deno.test("isRateLimited: true only for http_status 429", () => {
  assertEquals(isRateLimited(fakeResult({ http_status: 429 })), true);
  assertEquals(isRateLimited(fakeResult({ http_status: 200 })), false);
  assertEquals(isRateLimited(fakeResult({ http_status: 500 })), false);
  assertEquals(isRateLimited(fakeResult({ http_status: null })), false);
});

Deno.test("computeBackoffSeconds: doubles per consecutive event, off the project's own interval", () => {
  const project: BackoffProject = { check_interval_seconds: 60, rate_limit_backoff_count: 0 };
  assertEquals(computeBackoffSeconds(project), 120); // 60 * 2^1
  assertEquals(computeBackoffSeconds({ ...project, rate_limit_backoff_count: 1 }), 240); // 60 * 2^2
  assertEquals(computeBackoffSeconds({ ...project, rate_limit_backoff_count: 2 }), 480); // 60 * 2^3
});

Deno.test("computeBackoffSeconds: caps at MAX_BACKOFF_SECONDS", () => {
  const project: BackoffProject = { check_interval_seconds: 300, rate_limit_backoff_count: 10 };
  assertEquals(computeBackoffSeconds(project), MAX_BACKOFF_SECONDS);
});

function fakeClient(): {
  client: BackoffClient;
  updates: Record<string, unknown>[];
} {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    client: {
      from: (_table: string) => ({
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          return { eq: (_column: string, _value: string) => Promise.resolve({ error: null }) };
        },
      }),
    },
  };
}

Deno.test("applyRateLimitBackoff: sets backoff_until and increments count on a 429", async () => {
  const { client, updates } = fakeClient();
  await applyRateLimitBackoff(
    client,
    "test-project",
    { check_interval_seconds: 60, rate_limit_backoff_count: 1 },
    true,
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0].rate_limit_backoff_count, 2);
  assertEquals(typeof updates[0].rate_limit_backoff_until, "string");
});

Deno.test("applyRateLimitBackoff: clears backoff once a check is no longer rate-limited", async () => {
  const { client, updates } = fakeClient();
  await applyRateLimitBackoff(
    client,
    "test-project",
    { check_interval_seconds: 60, rate_limit_backoff_count: 3 },
    false,
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0], { rate_limit_backoff_until: null, rate_limit_backoff_count: 0 });
});

Deno.test("applyRateLimitBackoff: no-op when a healthy project was never backed off", async () => {
  const { client, updates } = fakeClient();
  await applyRateLimitBackoff(
    client,
    "test-project",
    { check_interval_seconds: 60, rate_limit_backoff_count: 0 },
    false,
  );
  assertEquals(updates.length, 0);
});
