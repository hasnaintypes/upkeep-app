// Unit tests for persist.ts, using a fake InsertableClient that records what
// would have been inserted -- no real Supabase project needed.
import { assertEquals } from "@std/assert";
import { writeCheckResult, type InsertableClient } from "./persist.ts";
import type { CheckResult } from "./check.ts";

function fakeResult(overrides: Partial<CheckResult>): CheckResult {
  return {
    project_id: "test-project",
    http_status: 200,
    response_time_ms: 100,
    response_snippet: "the actual response body",
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

function fakeClient(): {
  client: InsertableClient;
  inserted: Record<string, unknown>[];
} {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    client: {
      // `_table` must exist to satisfy InsertableClient's shape, unused here.
      from: (_table: string) => ({
        insert: (values: Record<string, unknown>) => {
          inserted.push(values);
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
}

Deno.test("writeCheckResult: nulls response_snippet when status is up", async () => {
  const { client, inserted } = fakeClient();
  await writeCheckResult(client, fakeResult({}), "up");
  assertEquals(inserted[0].response_snippet, null);
});

Deno.test("writeCheckResult: keeps response_snippet when status is down", async () => {
  const { client, inserted } = fakeClient();
  await writeCheckResult(
    client,
    fakeResult({ response_snippet: "error page body" }),
    "down",
  );
  assertEquals(inserted[0].response_snippet, "error page body");
});

Deno.test("writeCheckResult: keeps response_snippet for degraded/waking/unknown too", async () => {
  for (const status of ["degraded", "waking", "unknown"] as const) {
    const { client, inserted } = fakeClient();
    await writeCheckResult(client, fakeResult({}), status);
    assertEquals(inserted[0].response_snippet, "the actual response body");
  }
});

Deno.test("writeCheckResult: reports persisted=true on success", async () => {
  const { client } = fakeClient();
  const outcome = await writeCheckResult(client, fakeResult({}), "up");
  assertEquals(outcome, { project_id: "test-project", persisted: true });
});

Deno.test("writeCheckResult: reports persisted=false and the error on failure, never throws", async () => {
  const failingClient: InsertableClient = {
    // `_table`/`_values` must exist to satisfy InsertableClient's shape, unused here.
    from: (_table: string) => ({
      insert: (_values: Record<string, unknown>) =>
        Promise.resolve({ error: { message: "connection reset" } }),
    }),
  };

  const outcome = await writeCheckResult(failingClient, fakeResult({}), "up");
  assertEquals(outcome.persisted, false);
  assertEquals(outcome.error, "connection reset");
});
