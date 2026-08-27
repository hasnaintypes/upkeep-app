// Unit tests for incidents.ts (issue #35 AC: exactly one incident per
// streak, correct started_at, no incident for a sub-threshold blip, and a
// cause derived from the triggering checks; issue #36 AC: resolution lands
// on the Mth consecutive `up` check, a flapping project never reaches that
// threshold and stays on the same open incident, and resolving updates
// that same row rather than inserting a new one). Run with `deno test`
// from this directory -- no Docker, no Supabase project, no network access
// required.
import { assertEquals, assertExists } from "@std/assert";
import {
  crossesEscalationThreshold,
  deriveIncidentCause,
  maybeOpenIncident,
  maybeResolveIncident,
  meetsRecoveryThreshold,
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
 * insert/update call it receives, and returns canned data for the two
 * selects. */
function fakeClient(options: {
  recentChecks: RecentCheck[];
  openIncidents: { id: string }[];
}): {
  client: IncidentClient;
  inserted: Record<string, unknown>[];
  updated: { values: Record<string, unknown>; id: string }[];
} {
  const inserted: Record<string, unknown>[] = [];
  const updated: { values: Record<string, unknown>; id: string }[] = [];

  const client = {
    from(table: string) {
      if (table === "checks") {
        // `.eq("is_consensus", true).eq("is_rate_limited", false)` -- both
        // canned to just return `options.recentChecks` regardless of the
        // actual filter values passed, same "configurable canned data"
        // philosophy every other test using this helper already relies on.
        const eqChain = {
          eq: (_column2: string, _value2: boolean) => eqChain,
          order: (_column: string, _opts: { ascending: boolean }) => ({
            limit: (_n: number) => Promise.resolve({ data: options.recentChecks, error: null }),
          }),
        };
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => eqChain,
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
          update: (values: Record<string, unknown>) => ({
            eq: (_column: string, id: string) => {
              updated.push({ values, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    // The runtime dispatch on `table` above is exactly what IncidentClient's
    // overloaded `from()` describes, but a single non-overloaded
    // implementation can't be assigned directly to an overloaded type --
    // `unknown` as an intermediate keeps this an explicit, narrow cast
    // instead of reaching for `any`.
  } as unknown as IncidentClient;

  return { client, inserted, updated };
}

Deno.test("maybeOpenIncident: filters the recent-checks query to is_consensus = true and is_rate_limited = false (#60/#61)", async () => {
  const seenEqCalls: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      if (table === "checks") {
        const eqChain = (depth: number): unknown => ({
          eq: (column2: string, value2: boolean) => {
            seenEqCalls.push([column2, value2]);
            return eqChain(depth + 1);
          },
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: [check({ status: "down" }), check({ status: "down" })],
                error: null,
              }),
          }),
        });
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              seenEqCalls.push([column, value]);
              return eqChain(0);
            },
          }),
        };
      }
      if (table === "incidents") {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as IncidentClient;

  await maybeOpenIncident(client, "project-1", "down", 2);

  assertEquals(seenEqCalls, [
    ["project_id", "project-1"],
    ["is_consensus", true],
    ["is_rate_limited", false],
  ]);
});

Deno.test("maybeOpenIncident: an up check never queries anything -- 'not_failing'", async () => {
  const throwingClient = {
    from() {
      throw new Error("should not be called for a healthy check");
    },
  } as unknown as IncidentClient;

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
        const eqChain: unknown = {
          eq: () => eqChain,
          order: () => ({
            limit: () =>
              Promise.resolve({ data: null, error: { message: "connection reset" } }),
          }),
        };
        return {
          select: () => ({
            eq: () => eqChain,
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as IncidentClient;

  const result = await maybeOpenIncident(client, "project-1", "down", 2);
  assertEquals(result.opened, false);
  assertExists((result as { error?: string }).error);
});

Deno.test("maybeOpenIncident: two consecutive 429s never open a false incident (#61)", async () => {
  // A faithful-enough fake that actually applies the is_consensus/
  // is_rate_limited filters (unlike fakeClient's canned-array shortcut
  // above) -- this is the one test that needs to prove the *filtering*
  // itself works, not just that maybeOpenIncident calls .eq() with the
  // right arguments.
  const rows: Array<RecentCheck & { is_consensus: boolean; is_rate_limited: boolean }> = [
    {
      ...check({ status: "up", checked_at: "2026-08-24T00:00:00Z" }),
      is_consensus: true,
      is_rate_limited: false,
    },
    {
      ...check({ status: "down", checked_at: "2026-08-24T00:01:00Z", http_status: 429 }),
      is_consensus: true,
      is_rate_limited: true,
    },
    {
      ...check({ status: "down", checked_at: "2026-08-24T00:02:00Z", http_status: 429 }),
      is_consensus: true,
      is_rate_limited: true,
    },
  ];
  const inserted: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table === "checks") {
        return {
          select: () => ({
            eq: (_c1: string, _projectId: string) => ({
              eq: (_c2: string, consensusValue: boolean) => ({
                eq: (_c3: string, rateLimitedValue: boolean) => ({
                  order: () => ({
                    limit: (n: number) =>
                      Promise.resolve({
                        data: rows
                          .filter(
                            (r) =>
                              r.is_consensus === consensusValue &&
                              r.is_rate_limited === rateLimitedValue,
                          )
                          .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
                          .slice(0, n),
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "incidents") {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as IncidentClient;

  const result = await maybeOpenIncident(client, "project-1", "down", 2);

  // With the two 429 rows excluded, only the one prior "up" check remains
  // -- below threshold, so no incident opens purely from Upkeep's own
  // rate-limit backoff.
  assertEquals(result, { opened: false, reason: "below_threshold" });
  assertEquals(inserted.length, 0);
});

// --- meetsRecoveryThreshold -------------------------------------------------

Deno.test("meetsRecoveryThreshold: fewer checks than threshold -> false", () => {
  assertEquals(meetsRecoveryThreshold([check({ status: "up" })], 2), false);
});

Deno.test("meetsRecoveryThreshold: exactly threshold, all up -> true", () => {
  assertEquals(
    meetsRecoveryThreshold([check({ status: "up" }), check({ status: "up" })], 2),
    true,
  );
});

Deno.test("meetsRecoveryThreshold: a single recovery blip (up then down, newest-first) -> false", () => {
  assertEquals(
    meetsRecoveryThreshold([check({ status: "up" }), check({ status: "down" })], 2),
    false,
  );
});

Deno.test("meetsRecoveryThreshold: waking does not count as full recovery", () => {
  assertEquals(
    meetsRecoveryThreshold([check({ status: "up" }), check({ status: "waking" })], 2),
    false,
  );
});

// --- maybeResolveIncident ----------------------------------------------------

Deno.test("maybeResolveIncident: a down/degraded check never queries anything -- 'not_recovering'", async () => {
  const throwingClient = {
    from() {
      throw new Error("should not be called for a non-up check");
    },
  } as unknown as IncidentClient;

  const result = await maybeResolveIncident(throwingClient, "project-1", "down", 2);
  assertEquals(result, { resolved: false, reason: "not_recovering" });
});

Deno.test("maybeResolveIncident: no open incident -> skips the checks lookup entirely", async () => {
  let checksQueried = false;
  const client = {
    from(table: string) {
      if (table === "incidents") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        };
      }
      if (table === "checks") {
        checksQueried = true;
        throw new Error("should not query checks when no incident is open");
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as IncidentClient;

  const result = await maybeResolveIncident(client, "project-1", "up", 2);
  assertEquals(result, { resolved: false, reason: "no_open_incident" });
  assertEquals(checksQueried, false);
});

Deno.test("maybeResolveIncident: a single up check (below threshold) leaves the incident open", async () => {
  const { client, updated } = fakeClient({
    recentChecks: [check({ status: "up" })],
    openIncidents: [{ id: "incident-1" }],
  });

  const result = await maybeResolveIncident(client, "project-1", "up", 2);
  assertEquals(result, { resolved: false, reason: "below_threshold" });
  assertEquals(updated.length, 0);
});

Deno.test("maybeResolveIncident: M consecutive up checks resolves the open incident, end time = newest (Mth) check", async () => {
  const olderUp = check({ status: "up", checked_at: "2026-08-24T00:05:00Z" });
  const newestUp = check({ status: "up", checked_at: "2026-08-24T00:06:00Z" });
  const { client, updated } = fakeClient({
    recentChecks: [newestUp, olderUp], // newest-first, as the real query returns
    openIncidents: [{ id: "incident-1" }],
  });

  const result = await maybeResolveIncident(client, "project-1", "up", 2);

  assertEquals(result, {
    resolved: true,
    incidentId: "incident-1",
    resolvedAt: newestUp.checked_at,
  });
  assertEquals(updated.length, 1);
  assertEquals(updated[0].id, "incident-1");
  assertEquals(updated[0].values.resolved_at, newestUp.checked_at);
});

Deno.test("maybeResolveIncident: a flapping project (never M consecutive ups) never resolves, no update issued", async () => {
  // newest-first: up, down, up -- never two `up`s back to back.
  const { client, updated } = fakeClient({
    recentChecks: [
      check({ status: "up", checked_at: "2026-08-24T00:03:00Z" }),
      check({ status: "down", checked_at: "2026-08-24T00:02:00Z" }),
    ],
    openIncidents: [{ id: "incident-1" }],
  });

  const result = await maybeResolveIncident(client, "project-1", "up", 2);
  assertEquals(result, { resolved: false, reason: "below_threshold" });
  assertEquals(updated.length, 0);
});

Deno.test("maybeResolveIncident: surfaces (not throws) an update error", async () => {
  const client = {
    from(table: string) {
      if (table === "incidents") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                limit: () => Promise.resolve({ data: [{ id: "incident-1" }], error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: { message: "connection reset" } }),
          }),
        };
      }
      if (table === "checks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [check({ status: "up" }), check({ status: "up" })],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as IncidentClient;

  const result = await maybeResolveIncident(client, "project-1", "up", 2);
  assertEquals(result.resolved, false);
  assertExists((result as { error?: string }).error);
});
