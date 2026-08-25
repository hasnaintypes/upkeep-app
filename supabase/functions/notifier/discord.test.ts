// Unit tests for discord.ts, using a stubbed global `fetch` -- no real
// Discord webhook or network access needed (see notifier's own README/#41
// close notes for the real, live end-to-end verification that was also
// run against an actual Discord webhook before this shipped).
import { assertEquals } from "@std/assert";
import { buildDiscordPayload, dispatchDiscord } from "./discord.ts";
import type { NotificationChannel, NotificationEvent } from "./dispatch.ts";

function fakeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: "channel-1",
    type: "discord",
    config: { webhook_url: "https://discord.test/api/webhooks/1/abc" },
    ...overrides,
  };
}

function fakeOpenEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    kind: "opened",
    project: { id: "project-1", name: "Test Project" },
    incident: {
      id: "incident-1",
      started_at: "2026-08-25T00:00:00.000Z",
      resolved_at: null,
      cause: "timeout",
    },
    ...overrides,
  };
}

function fakeResolvedEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return fakeOpenEvent({
    kind: "resolved",
    incident: {
      id: "incident-1",
      started_at: "2026-08-25T00:00:00.000Z",
      resolved_at: "2026-08-25T01:30:00.000Z",
      cause: "timeout",
    },
    ...overrides,
  });
}

// --- buildDiscordPayload ----------------------------------------------------

Deno.test("buildDiscordPayload: opened event -> red embed, Down status, no Duration/Resolved fields", () => {
  const payload = buildDiscordPayload(fakeOpenEvent()) as {
    embeds: { title: string; color: number; fields: { name: string; value: string }[] }[];
  };
  const embed = payload.embeds[0];

  assertEquals(embed.title, "🔴 Incident opened");
  assertEquals(embed.color, 0xed4245);
  assertEquals(embed.fields.some((f) => f.name === "Project" && f.value === "Test Project"), true);
  assertEquals(embed.fields.some((f) => f.name === "Status" && f.value === "Down"), true);
  assertEquals(embed.fields.some((f) => f.name === "Started"), true);
  assertEquals(embed.fields.some((f) => f.name === "Resolved"), false);
  assertEquals(embed.fields.some((f) => f.name === "Duration"), false);
  assertEquals(embed.fields.some((f) => f.name === "Cause" && f.value === "timeout"), true);
});

Deno.test("buildDiscordPayload: resolved event -> green embed, Resolved status, includes Resolved + Duration fields", () => {
  const payload = buildDiscordPayload(fakeResolvedEvent()) as {
    embeds: { title: string; color: number; fields: { name: string; value: string }[] }[];
  };
  const embed = payload.embeds[0];

  assertEquals(embed.title, "✅ Incident resolved");
  assertEquals(embed.color, 0x57f287);
  assertEquals(embed.fields.some((f) => f.name === "Status" && f.value === "Resolved"), true);
  assertEquals(embed.fields.some((f) => f.name === "Resolved"), true);
  const duration = embed.fields.find((f) => f.name === "Duration");
  assertEquals(duration?.value, "1h 30m");
});

Deno.test("buildDiscordPayload: no cause recorded -> no Cause field", () => {
  const payload = buildDiscordPayload(
    fakeOpenEvent({ incident: { id: "incident-1", started_at: "2026-08-25T00:00:00.000Z", resolved_at: null, cause: null } }),
  ) as { embeds: { fields: { name: string }[] }[] };
  assertEquals(payload.embeds[0].fields.some((f) => f.name === "Cause"), false);
});

// --- dispatchDiscord ---------------------------------------------------------

Deno.test("dispatchDiscord: missing webhook_url -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;

  try {
    const result = await dispatchDiscord(fakeChannel({ config: {} }), fakeOpenEvent());
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchDiscord: successful webhook post -> ok:true, POSTs JSON to the configured URL", async () => {
  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input;
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;

  try {
    const result = await dispatchDiscord(fakeChannel(), fakeOpenEvent());
    assertEquals(result, { ok: true });
    assertEquals(capturedUrl, "https://discord.test/api/webhooks/1/abc");
    assertEquals(capturedInit?.method, "POST");
    assertEquals((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.embeds[0].title, "🔴 Incident opened");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchDiscord: a non-2xx response (e.g. revoked webhook) -> ok:false, includes the status, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("Unknown Webhook", { status: 404 }))) as typeof fetch;

  try {
    const result = await dispatchDiscord(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("404"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchDiscord: a network failure -> ok:false, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new TypeError("network error");
  }) as typeof fetch;

  try {
    const result = await dispatchDiscord(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("network error"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
