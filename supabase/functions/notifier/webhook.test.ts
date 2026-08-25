// Unit tests for webhook.ts, using a stubbed global `fetch` -- no real
// third-party endpoint or network access needed (see #43's close notes for
// the real, live end-to-end verification also run against an actual
// webhook.site URL before this shipped).
import { assertEquals } from "@std/assert";
import { buildWebhookPayload, dispatchWebhook } from "./webhook.ts";
import type { NotificationChannel, NotificationEvent } from "./dispatch.ts";

function fakeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: "channel-1",
    type: "webhook",
    config: { url: "https://example.test/hooks/upkeep" },
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
      resolved_at: "2026-08-25T00:05:00.000Z",
      cause: "timeout",
    },
    ...overrides,
  });
}

// --- buildWebhookPayload -----------------------------------------------------

Deno.test("buildWebhookPayload: opened event -> event=incident.opened, duration_seconds null", () => {
  const payload = buildWebhookPayload(fakeOpenEvent()) as {
    event: string;
    project: { id: string; name: string };
    incident: { id: string; duration_seconds: number | null; cause: string | null };
  };

  assertEquals(payload.event, "incident.opened");
  assertEquals(payload.project, { id: "project-1", name: "Test Project" });
  assertEquals(payload.incident.duration_seconds, null);
  assertEquals(payload.incident.cause, "timeout");
});

Deno.test("buildWebhookPayload: resolved event -> event=incident.resolved, correct duration_seconds", () => {
  const payload = buildWebhookPayload(fakeResolvedEvent()) as {
    event: string;
    incident: { resolved_at: string | null; duration_seconds: number | null };
  };

  assertEquals(payload.event, "incident.resolved");
  assertEquals(payload.incident.resolved_at, "2026-08-25T00:05:00.000Z");
  assertEquals(payload.incident.duration_seconds, 300);
});

Deno.test("buildWebhookPayload: includes a sent_at timestamp", () => {
  const payload = buildWebhookPayload(fakeOpenEvent()) as { sent_at: string };
  assertEquals(typeof payload.sent_at, "string");
  assertEquals(Number.isNaN(new Date(payload.sent_at).getTime()), false);
});

// --- dispatchWebhook ----------------------------------------------------------

Deno.test("dispatchWebhook: missing url -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await dispatchWebhook(fakeChannel({ config: {} }), fakeOpenEvent());
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchWebhook: a non-absolute-URL config value -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await dispatchWebhook(fakeChannel({ config: { url: "not-a-url" } }), fakeOpenEvent());
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchWebhook: successful POST -> ok:true, sends JSON to the configured URL", async () => {
  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input;
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await dispatchWebhook(fakeChannel(), fakeOpenEvent());
    assertEquals(result, { ok: true });
    assertEquals(capturedUrl, "https://example.test/hooks/upkeep");
    assertEquals(capturedInit?.method, "POST");
    assertEquals(
      (capturedInit?.headers as Record<string, string>)["Content-Type"],
      "application/json",
    );
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.event, "incident.opened");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchWebhook: a non-2xx response -> ok:false, includes the status, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;

  try {
    const result = await dispatchWebhook(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("500"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchWebhook: an unreachable endpoint (network failure) -> ok:false, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new TypeError("error sending request");
  }) as typeof fetch;

  try {
    const result = await dispatchWebhook(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("error sending request"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
