// Unit tests for incidents.ts (issue #35 AC: exactly one incident per
// streak, correct started_at, no incident for a sub-threshold blip, and a
// cause derived from the triggering checks). Run with `deno test` from this
// directory -- no Docker, no Supabase project, no network access required.
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  crossesEscalationThreshold,
  deriveIncidentCause,
  maybeOpenIncident,
  type IncidentClient,
  type RecentCheck,
} from "./incidents.ts";

function check(overrides: Partial<RecentCheck>): RecentCheck {
  return {
    status: "down",
    checked_at: "2026-08-24T00:00:00Z",
    http_status: null,
    error_message: null,
    response_time_ms: null,
    ...overrides,
  };
}

// --- crossesEscalationThreshold -------------------------------------------

Deno.test("crossesEscalationThreshold: fewer checks than threshold -> false", () => {
  assertEquals(crossesEscalationThreshold([check({})], 2), false);
});

Deno.test("crossesEscalationThreshold: exactly threshold, all down -> true", () => {
  assertEquals(
    crossesEscalationThreshold([check({ status: "down" }), check({ status: "down" })], 2),
    true,
  );
});

Deno.test("crossesEscalationThreshold: down + degraded both count -> true", () => {
  assertEquals(
    crossesEscalationThreshold([check({ status: "down" }), check({ status: "degraded" })], 2),
    true,
  );
});

Deno.test("crossesEscalationThreshold: a single blip (down then up, newest-first) -> false", () => {
  // newest-first: index 0 is the just-inserted check, index 1 is the one
  // before it -- an `up` anywhere in the window breaks the streak.
  assertEquals(
    crossesEscalationThreshold([check({ status: "down" }), check({ status: "up" })], 2),
    false,
  );
});

Deno.test("crossesEscalationThreshold: waking does not count toward the streak", () => {
  assertEquals(
    crossesEscalationThreshold([check({ status: "down" }), check({ status: "waking" })], 2),
    false,
  );
});

Deno.test("crossesEscalationThreshold: unknown does not count toward the streak", () => {
  assertEquals(
    crossesEscalationThreshold([check({ status: "down" }), check({ status: "unknown" })], 2),
    false,
  );
});

Deno.test("crossesEscalationThreshold: only inspects the most recent `threshold` checks", () => {
  // A longer streak than threshold still crosses -- the extra older rows
  // beyond the window are irrelevant to *this* evaluation.
  assertEquals(
    crossesEscalationThreshold(
      [check({ status: "down" }), check({ status: "down" }), check({ status: "up" })],
      2,
    ),
    true,
  );
});

// --- deriveIncidentCause ---------------------------------------------------

Deno.test("deriveIncidentCause: prefers error_message when present", () => {
  assertEquals(
    deriveIncidentCause(
      check({ status: "down", error_message: "dns error: failed to lookup address information" }),
    ),
    "dns error: failed to lookup address information",
  );
});

Deno.test("deriveIncidentCause: degraded with response_time_ms -> slow-response message", () => {
  assertEquals(
    deriveIncidentCause(check({ status: "degraded", response_time_ms: 4200 })),
    "Slow response (4200ms)",
  );
});

Deno.test("deriveIncidentCause: down with http_status, no error_message -> unexpected-status message", () => {
  assertEquals(
    deriveIncidentCause(check({ status: "down", http_status: 503 })),
    "Unexpected HTTP status 503",
  );
});

Deno.test("deriveIncidentCause: down with neither error_message nor http_status -> generic fallback", () => {
  assertEquals(deriveIncidentCause(check({ status: "down" })), "Check failed");
});

// --- maybeOpenIncident (integration of the two pure functions + client) ---

/** A configurable fake IncidentClient: records every `checks`/`incidents`
 * insert call it receives, and returns canned data for the two selects. */
function fakeClient(options: {
  recentChecks: RecentCheck[];
  openIncidents: { id: string }[];
}): { client: IncidentClient; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table === "checks") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              order: (_column: string, _opts: { ascending: boolean }) => ({
                limit: (_n: number) =>
                  Promise.resolve({ data: options.recentChecks, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === "incidents") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              is: (_column: string, _value: null) => ({
                limit: (_n: number) =>
                  Promise.resolve({ data: options.openIncidents, error: null }),
              }),
            }),
          }),
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { client, inserted };
}

Deno.test("maybeOpenIncident: an up check never queries anything -- 'not_failing'", async () => {
  const throwingClient = {
    from() {
      throw new Error("should not be called for a healthy check");
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const result = await maybeOpenIncident(throwingClient, "project-1", "up", 2);
  assertEquals(result, { opened: false, reason: "not_failing" });
});

Deno.test("maybeOpenIncident: a single down check (below threshold) does not open an incident", async () => {
  const { client, inserted } = fakeClient({
    recentChecks: [check({ status: "down" })],
    openIncidents: [],
  });

  const result = await maybeOpenIncident(client, "project-1", "down", 2);
  assertEquals(result, { opened: false, reason: "below_threshold" });
  assertEquals(inserted.length, 0);
});

Deno.test("maybeOpenIncident: N consecutive down checks opens exactly one incident, started_at = oldest", async () => {
  const oldest = check({ status: "down", checked_at: "2026-08-24T00:00:00Z", error_message: "timeout" });
  const newest = check({ status: "down", checked_at: "2026-08-24T00:01:00Z", error_message: "timeout" });
  const { client, inserted } = fakeClient({
    recentChecks: [newest, oldest], // newest-first, as the real query returns
    openIncidents: [],
  });

  const result = await maybeOpenIncident(client, "project-1", "down", 2);

  assertEquals(result, { opened: true, startedAt: oldest.checked_at, cause: "timeout" });
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].project_id, "project-1");
  assertEquals(inserted[0].started_at, oldest.checked_at);
  assertEquals(inserted[0].cause, "timeout");
});

Deno.test("maybeOpenIncident: does not open a second incident while one is already open", async () => {
  const { client, inserted } = fakeClient({
    recentChecks: [check({ status: "down" }), check({ status: "down" })],
    openIncidents: [{ id: "existing-incident" }],
  });

  const result = await maybeOpenIncident(client, "project-1", "down", 2);

  assertEquals(result, { opened: false, reason: "already_open" });
  assertEquals(inserted.length, 0);
});

Deno.test("maybeOpenIncident: surfaces (not throws) a checks-query error", async () => {
  const client = {
    from(table: string) {
      if (table === "checks") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({ data: null, error: { message: "connection reset" } }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const result = await maybeOpenIncident(client, "project-1", "down", 2);
  assertEquals(result.opened, false);
  assertExists((result as { error?: string }).error);
});
