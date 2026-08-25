// Unit tests for notifier.ts, using a fake NotifierClient and fake channel
// dispatchers -- no real Supabase project or network access required.
import { assertEquals } from "@std/assert";
import {
  runNotifier,
  type NotifiableIncident,
  type NotificationRuleWithChannel,
  type NotifierClient,
} from "./notifier.ts";
import type { ChannelDispatcher, NotificationChannelType } from "./dispatch.ts";

function fakeIncident(overrides: Partial<NotifiableIncident> = {}): NotifiableIncident {
  return {
    id: "incident-1",
    project_id: "project-1",
    started_at: "2026-08-25T00:00:00Z",
    resolved_at: null,
    cause: "timeout",
    ...overrides,
  };
}

function fakeRule(
  overrides: Partial<Omit<NotificationRuleWithChannel, "notification_channels">> & {
    channel?: Partial<NonNullable<NotificationRuleWithChannel["notification_channels"]>> | null;
  } = {},
): NotificationRuleWithChannel {
  const { channel, ...ruleOverrides } = overrides;
  return {
    escalation_threshold: 1,
    is_muted: false,
    digest_only: false,
    notification_channels:
      channel === null
        ? null
        : { id: "channel-1", type: "discord", config: {}, is_active: true, ...channel },
    ...ruleOverrides,
  };
}

/** A configurable fake NotifierClient -- mirrors incidents.test.ts's own
 * `fakeClient` factory (records mutations, returns canned data for every
 * select). */
function fakeClient(options: {
  openedIncidents?: NotifiableIncident[];
  openedError?: string;
  resolvedIncidents?: NotifiableIncident[];
  resolvedError?: string;
  projectsById?: Record<string, { id: string; name: string } | null>;
  projectError?: string;
  rulesByProjectId?: Record<string, NotificationRuleWithChannel[]>;
  rulesError?: string;
}): {
  client: NotifierClient;
  updated: { id: string; values: Record<string, unknown> }[];
} {
  const updated: { id: string; values: Record<string, unknown> }[] = [];

  const client = {
    from(table: string) {
      if (table === "incidents") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: boolean) => ({
              order: (_column: string, _opts: { ascending: boolean }) => ({
                limit: (_n: number) =>
                  Promise.resolve(
                    options.openedError
                      ? { data: null, error: { message: options.openedError } }
                      : { data: options.openedIncidents ?? [], error: null },
                  ),
              }),
            }),
            not: (_column: string, _operator: string, _value: null) => ({
              eq: (_column: string, _value: boolean) => ({
                order: (_column: string, _opts: { ascending: boolean }) => ({
                  limit: (_n: number) =>
                    Promise.resolve(
                      options.resolvedError
                        ? { data: null, error: { message: options.resolvedError } }
                        : { data: options.resolvedIncidents ?? [], error: null },
                    ),
                }),
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: (_column: string, id: string) => {
              updated.push({ id, values });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === "projects") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: () =>
                Promise.resolve(
                  options.projectError
                    ? { data: null, error: { message: options.projectError } }
                    : { data: options.projectsById?.[id] ?? null, error: null },
                ),
            }),
          }),
        };
      }

      if (table === "project_notification_rules") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, projectId: string) =>
              Promise.resolve(
                options.rulesError
                  ? { data: null, error: { message: options.rulesError } }
                  : { data: options.rulesByProjectId?.[projectId] ?? [], error: null },
              ),
          }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    // The runtime dispatch on `table` above is exactly what NotifierClient's
    // overloaded `from()` describes, but a single non-overloaded
    // implementation can't be assigned directly to an overloaded type --
    // `unknown` as an intermediate keeps this an explicit, narrow cast
    // instead of reaching for `any`.
  } as unknown as NotifierClient;

  return { client, updated };
}

function fakeDispatchers(
  overrides: Partial<Record<NotificationChannelType, ChannelDispatcher>> = {},
): Record<NotificationChannelType, ChannelDispatcher> {
  const alwaysOk: ChannelDispatcher = () => Promise.resolve({ ok: true });
  return {
    discord: alwaysOk,
    telegram: alwaysOk,
    webhook: alwaysOk,
    email: alwaysOk,
    ...overrides,
  };
}

Deno.test("runNotifier: nothing to notify -- empty summary, no errors", async () => {
  const { client } = fakeClient({});
  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary, { opened: [], resolved: [], errors: [] });
});

Deno.test("runNotifier: a project with no notification rules produces a zero-attempt outcome, no errors", async () => {
  const { client, updated } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: {},
  });

  const summary = await runNotifier(client, fakeDispatchers());

  assertEquals(summary.errors, []);
  assertEquals(summary.opened, [
    { incidentId: "incident-1", kind: "opened", attempted: 0, failed: [] },
  ]);
  assertEquals(updated, [{ id: "incident-1", values: { notified: true } }]);
});

Deno.test("runNotifier: dispatches to an eligible channel and marks the incident notified", async () => {
  const { client, updated } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule()] },
  });

  let calledWith: unknown = null;
  const dispatchers = fakeDispatchers({
    discord: (channel, event) => {
      calledWith = { channel, event };
      return Promise.resolve({ ok: true });
    },
  });

  const summary = await runNotifier(client, dispatchers);

  assertEquals(summary.opened, [
    { incidentId: "incident-1", kind: "opened", attempted: 1, failed: [] },
  ]);
  assertEquals(updated, [{ id: "incident-1", values: { notified: true } }]);
  assertEquals(calledWith, {
    channel: { id: "channel-1", type: "discord", config: {}, is_active: true },
    event: {
      kind: "opened",
      project: { id: "project-1", name: "Test Project" },
      incident: {
        id: "incident-1",
        started_at: "2026-08-25T00:00:00Z",
        resolved_at: null,
        cause: "timeout",
      },
    },
  });
});

Deno.test("runNotifier: excludes a muted rule", async () => {
  const { client } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule({ is_muted: true })] },
  });

  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened[0].attempted, 0);
});

Deno.test("runNotifier: excludes a digest_only rule", async () => {
  const { client } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule({ digest_only: true })] },
  });

  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened[0].attempted, 0);
});

Deno.test("runNotifier: excludes an inactive channel", async () => {
  const { client } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule({ channel: { is_active: false } })] },
  });

  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened[0].attempted, 0);
});

Deno.test("runNotifier: excludes a rule whose escalation_threshold exceeds the incident open-threshold (v1 scope)", async () => {
  const { client } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule({ escalation_threshold: 5 })] },
  });

  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened[0].attempted, 0);
});

Deno.test("runNotifier: a rule at exactly the incident open-threshold is eligible", async () => {
  const { client } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule({ escalation_threshold: 2 })] },
  });

  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened[0].attempted, 1);
});

Deno.test("runNotifier: one channel's dispatch failure doesn't block another channel, and the incident is still marked notified", async () => {
  const { client, updated } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: {
      "project-1": [
        fakeRule({ channel: { id: "channel-1", type: "discord" } }),
        fakeRule({ channel: { id: "channel-2", type: "webhook" } }),
      ],
    },
  });

  const dispatchers = fakeDispatchers({
    discord: () => Promise.resolve({ ok: false, error: "rate limited" }),
    webhook: () => Promise.resolve({ ok: true }),
  });

  const summary = await runNotifier(client, dispatchers);

  assertEquals(summary.opened[0].attempted, 2);
  assertEquals(summary.opened[0].failed, [{ channelId: "channel-1", error: "rate limited" }]);
  assertEquals(updated, [{ id: "incident-1", values: { notified: true } }]);
});

Deno.test("runNotifier: a resolve transition is processed independently of the open transition", async () => {
  const { client, updated } = fakeClient({
    resolvedIncidents: [
      fakeIncident({ id: "incident-2", resolved_at: "2026-08-25T01:00:00Z" }),
    ],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesByProjectId: { "project-1": [fakeRule()] },
  });

  const summary = await runNotifier(client, fakeDispatchers());

  assertEquals(summary.opened, []);
  assertEquals(summary.resolved, [
    { incidentId: "incident-2", kind: "resolved", attempted: 1, failed: [] },
  ]);
  assertEquals(updated, [{ id: "incident-2", values: { resolved_notified: true } }]);
});

Deno.test("runNotifier: surfaces (not throws) a failure to load incidents needing open-notification", async () => {
  const { client } = fakeClient({ openedError: "connection reset" });
  const summary = await runNotifier(client, fakeDispatchers());
  assertEquals(summary.opened, []);
  assertEquals(summary.errors.length, 1);
  assertEquals(summary.errors[0].includes("connection reset"), true);
});

Deno.test("runNotifier: surfaces (not throws) a project lookup failure without marking the incident notified", async () => {
  const { client, updated } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectError: "connection reset",
  });

  const summary = await runNotifier(client, fakeDispatchers());

  assertEquals(summary.opened, []);
  assertEquals(summary.errors.length, 1);
  assertEquals(updated, []);
});

Deno.test("runNotifier: surfaces (not throws) a rules lookup failure without marking the incident notified", async () => {
  const { client, updated } = fakeClient({
    openedIncidents: [fakeIncident()],
    projectsById: { "project-1": { id: "project-1", name: "Test Project" } },
    rulesError: "connection reset",
  });

  const summary = await runNotifier(client, fakeDispatchers());

  assertEquals(summary.opened, []);
  assertEquals(summary.errors.length, 1);
  assertEquals(updated, []);
});
