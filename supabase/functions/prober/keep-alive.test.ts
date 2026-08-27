// Unit tests for keep-alive.ts, using a fake KeepAliveClient and a stubbed
// global `fetch` -- no real Supabase project or network calls needed.
import { assertEquals } from "@std/assert";
import { runKeepAlivePings, type KeepAliveClient } from "./keep-alive.ts";
import type { DueProject } from "./check.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "https://example.com/health",
    method: "GET",
    headers: {},
    timeout_ms: 5000,
    body: null,
    retry_count: 1,
    expected_status: 200,
    check_type: "http",
    ...overrides,
  };
}

function fakeClient(dueProjects: DueProject[]): {
  client: KeepAliveClient;
  rpcCalledWith: string[];
  fromCalledWith: string[];
  updatedIds: string[][];
} {
  const rpcCalledWith: string[] = [];
  const fromCalledWith: string[] = [];
  const updatedIds: string[][] = [];
  return {
    rpcCalledWith,
    fromCalledWith,
    updatedIds,
    client: {
      rpc: (fn: string) => {
        rpcCalledWith.push(fn);
        return Promise.resolve({ data: dueProjects, error: null });
      },
      from: (table: string) => {
        fromCalledWith.push(table);
        return {
          update: (_values: Record<string, unknown>) => ({
            in: (_column: string, ids: string[]) => {
              updatedIds.push(ids);
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    },
  };
}

/** Temporarily replaces globalThis.fetch for the duration of `run`, always
 * restoring the original afterward even if `run` throws -- same helper
 * shape as manual-check.test.ts's own `withFakeFetch`. */
async function withFakeFetch<T>(
  fakeResponse: () => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(fakeResponse())) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("runKeepAlivePings: calls get_due_keep_alive_projects", async () => {
  const { client, rpcCalledWith } = fakeClient([]);
  await runKeepAlivePings(client);
  assertEquals(rpcCalledWith, ["get_due_keep_alive_projects"]);
});

Deno.test("runKeepAlivePings: no due projects -> no fetch, no update, count 0", async () => {
  const { client, updatedIds } = fakeClient([]);
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;

  try {
    const summary = await runKeepAlivePings(client);
    assertEquals(summary, { count: 0, pinged_project_ids: [], error: null });
    assertEquals(fetchCalled, false);
    assertEquals(updatedIds.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runKeepAlivePings: pings every due project and stamps last_keep_alive_at for all of them", async () => {
  const projects = [fakeProject({ id: "a" }), fakeProject({ id: "b" })];
  const { client, updatedIds } = fakeClient(projects);

  const summary = await withFakeFetch(
    () => new Response("ok", { status: 200 }),
    () => runKeepAlivePings(client),
  );

  assertEquals(summary, { count: 2, pinged_project_ids: ["a", "b"], error: null });
  assertEquals(updatedIds, [["a", "b"]]);
});

Deno.test("runKeepAlivePings: still stamps last_keep_alive_at even when the ping itself fails", async () => {
  const projects = [fakeProject({ id: "a" })];
  const { client, updatedIds } = fakeClient(projects);

  const summary = await withFakeFetch(
    () => new Response("server error", { status: 500 }),
    () => runKeepAlivePings(client),
  );

  // A keep-alive ping isn't gated on a successful/expected response the way
  // a monitoring check is -- the attempt itself is what matters, so the
  // project is still marked pinged and due-ness still advances.
  assertEquals(summary, { count: 1, pinged_project_ids: ["a"], error: null });
  assertEquals(updatedIds, [["a"]]);
});

Deno.test(
  "runKeepAlivePings: a failing ping never touches checks/incidents -- only .from(\"projects\") is ever called (#50)",
  async () => {
    const projects = [fakeProject({ id: "a" })];
    const { client, fromCalledWith } = fakeClient(projects);

    // A 500 (not just a network error) is enough to prove the point -- see
    // this module's own top comment: keep-alive intentionally has no
    // knowledge of expected_status/classification at all, so there is no
    // code path here that could react to "this ping failed" by writing a
    // `checks` row or evaluating an incident streak, unlike the monitoring
    // pipeline's check.ts -> classify.ts -> persist.ts -> incidents.ts.
    await withFakeFetch(
      () => new Response("server error", { status: 500 }),
      () => runKeepAlivePings(client),
    );

    assertEquals(fromCalledWith, ["projects"]);
  },
);

Deno.test(
  "runKeepAlivePings: a network-level failure (fetch rejects) still never touches checks/incidents (#50)",
  async () => {
    const projects = [fakeProject({ id: "a" })];
    const { client, fromCalledWith } = fakeClient(projects);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.reject(new Error("network error"))) as typeof fetch;

    try {
      const summary = await runKeepAlivePings(client);
      // check.ts's runHealthCheck catches this internally (never rejects),
      // so runKeepAlivePings still completes normally and stamps
      // last_keep_alive_at -- there is no error path here that reaches for
      // the `checks`/`incidents` tables.
      assertEquals(summary, { count: 1, pinged_project_ids: ["a"], error: null });
      assertEquals(fromCalledWith, ["projects"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test("runKeepAlivePings: never throws when the RPC returns an error", async () => {
  const failingClient: KeepAliveClient = {
    rpc: () => Promise.resolve({ data: null, error: { message: "connection reset" } }),
    from: () => ({
      update: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
  };

  const summary = await runKeepAlivePings(failingClient);
  assertEquals(summary, { count: 0, pinged_project_ids: [], error: "connection reset" });
});

Deno.test("runKeepAlivePings: reports the update error but keeps the pinged ids/count when the stamp write fails", async () => {
  const projects = [fakeProject({ id: "a" })];
  const client: KeepAliveClient = {
    rpc: () => Promise.resolve({ data: projects, error: null }),
    from: () => ({
      update: () => ({
        in: () => Promise.resolve({ error: { message: "write failed" } }),
      }),
    }),
  };

  const summary = await withFakeFetch(
    () => new Response("ok", { status: 200 }),
    () => runKeepAlivePings(client),
  );

  assertEquals(summary, { count: 1, pinged_project_ids: ["a"], error: "write failed" });
});

Deno.test("runKeepAlivePings: never throws when the client itself throws synchronously", async () => {
  const throwingClient: KeepAliveClient = {
    rpc: () => {
      throw new Error("unexpected");
    },
    from: () => ({
      update: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
  };

  const summary = await runKeepAlivePings(throwingClient);
  assertEquals(summary, { count: 0, pinged_project_ids: [], error: "unexpected" });
});
