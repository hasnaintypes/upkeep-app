// Unit tests for manual-check.ts, using a fake combined lookup/insert client
// and a stubbed global `fetch` -- no real Supabase project or network calls
// needed.
import { assertEquals } from "jsr:@std/assert@1";
import { runManualCheck, type ProjectLookupClient } from "./manual-check.ts";
import type { DueProject } from "./check.ts";
import type { InsertableClient } from "./persist.ts";
import type { IncidentClient } from "./incidents.ts";

type FakeClient = ProjectLookupClient & InsertableClient & IncidentClient;

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "https://example.test/health",
    method: "GET",
    headers: null,
    timeout_ms: 5000,
    body: null,
    retry_count: 0,
    expected_status: 200,
    ...overrides,
  };
}

/** Combined fake client covering every table this pipeline touches:
 * `projects` (the manual lookup), `checks` (persist.ts's insert *and*
 * incidents.ts's "recent checks for this project" select), and
 * `incidents` (the "already open?" select incidents.ts also runs). The
 * `checks`/`incidents` selects always report an empty history -- these
 * tests are about the check/persist pipeline itself, not incident
 * escalation (see incidents.test.ts for that), so keeping every recent-
 * checks lookup below the threshold means maybeOpenIncident short-circuits
 * on "below_threshold" without needing a richer fake here. */
function fakeClient(project: DueProject | null): {
  client: FakeClient;
  inserted: Record<string, unknown>[];
} {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              maybeSingle: () => Promise.resolve({ data: project, error: null }),
            }),
          }),
        };
      }

      if (table === "checks") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              order: (_column: string, _opts: { ascending: boolean }) => ({
                limit: (_n: number) => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "incidents") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              is: (_column: string, _value: null) => ({
                limit: (_n: number) => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          insert: (_values: Record<string, unknown>) => Promise.resolve({ error: null }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    // The runtime dispatch on `table` above is exactly what the
    // intersected ProjectLookupClient/InsertableClient/IncidentClient
    // `from()` overloads describe, but a single non-overloaded
    // implementation can't be assigned directly to an overloaded type --
    // `unknown` as an intermediate keeps this an explicit, narrow cast
    // instead of reaching for `any`.
  } as unknown as FakeClient;

  return { client, inserted };
}

/** Temporarily replaces globalThis.fetch for the duration of `run`, always
 * restoring the original afterward even if `run` throws. */
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

Deno.test("runManualCheck: 404s when the project doesn't exist / isn't owned by the caller", async () => {
  const { client } = fakeClient(null);
  const response = await runManualCheck(client, "missing-project");
  assertEquals(response.status, 404);
});

Deno.test("runManualCheck: 500s when the lookup itself fails, never throws", async () => {
  // The lookup itself fails, so the pipeline never reaches persist.ts/
  // incidents.ts -- this fake only needs to satisfy the `projects` branch.
  const failingClient = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    from: (table: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (columns: string) => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        eq: (column: string, value: string) => ({
          maybeSingle: () =>
            Promise.resolve({ data: null, error: { message: "connection reset" } }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      insert: (values: Record<string, unknown>) => Promise.resolve({ error: null }),
    }),
  } as unknown as FakeClient;

  const response = await runManualCheck(failingClient, "test-project");
  assertEquals(response.status, 500);
});

Deno.test("runManualCheck: checks, classifies, persists, and returns the outcome for a healthy response", async () => {
  const { client, inserted } = fakeClient(fakeProject());

  const body = await withFakeFetch(
    () => new Response("ok", { status: 200 }),
    async () => {
      const response = await runManualCheck(client, "test-project");
      assertEquals(response.status, 200);
      return response.json();
    },
  );

  assertEquals(body.manual, true);
  assertEquals(body.project_id, "test-project");
  assertEquals(body.status, "up");
  assertEquals(body.http_status, 200);
  assertEquals(body.persisted, true);
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].status, "up");
  assertEquals(inserted[0].response_snippet, null);
});

Deno.test("runManualCheck: still writes a checks row (with response_snippet) when the check fails", async () => {
  const { client, inserted } = fakeClient(fakeProject());

  const body = await withFakeFetch(
    () => new Response("server error body", { status: 500 }),
    async () => {
      const response = await runManualCheck(client, "test-project");
      return response.json();
    },
  );

  assertEquals(body.status, "down");
  assertEquals(body.persisted, true);
  assertEquals(inserted[0].response_snippet, "server error body");
});
