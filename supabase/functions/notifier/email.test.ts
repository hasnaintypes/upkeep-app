// Unit tests for email.ts, using a stubbed global `fetch` and an injected
// fake API key -- no real Resend account, network access, or `--allow-env`
// permission needed (see dispatch.ts's own `readEnv` comment for why that
// matters: `createEmailDispatcher` takes the key as a parameter precisely
// so these tests never touch `Deno.env` at all).
import { assertEquals } from "@std/assert";
import { buildEmailContent, createEmailDispatcher } from "./email.ts";
import type { NotificationChannel, NotificationEvent } from "./dispatch.ts";

function fakeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: "channel-1",
    type: "email",
    config: { to: "me@example.test" },
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
      resolved_at: "2026-08-25T02:00:00.000Z",
      cause: "timeout",
    },
    ...overrides,
  });
}

// --- buildEmailContent --------------------------------------------------------

Deno.test("buildEmailContent: opened event -> down subject, no Duration/Resolved rows", () => {
  const content = buildEmailContent(fakeOpenEvent());
  assertEquals(content.subject, "🔴 Test Project is down");
  assertEquals(content.text.includes("Status: Down"), true);
  assertEquals(content.text.includes("Duration"), false);
  assertEquals(content.text.includes("Cause: timeout"), true);
  assertEquals(content.html.includes("Incident opened"), true);
});

Deno.test("buildEmailContent: resolved event -> back-up subject, includes Duration", () => {
  const content = buildEmailContent(fakeResolvedEvent());
  assertEquals(content.subject, "✅ Test Project is back up");
  assertEquals(content.text.includes("Status: Resolved"), true);
  assertEquals(content.text.includes("Duration: 2h 0m"), true);
  assertEquals(content.html.includes("Incident resolved"), true);
});

Deno.test("buildEmailContent: escapes HTML-unsafe characters in field values", () => {
  const content = buildEmailContent(
    fakeOpenEvent({ project: { id: "project-1", name: "<script>alert(1)</script>" } }),
  );
  assertEquals(content.html.includes("<script>alert"), false);
  assertEquals(content.html.includes("&lt;script&gt;"), true);
});

// --- createEmailDispatcher -----------------------------------------------------

Deno.test("createEmailDispatcher: no API key configured -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher(undefined);
    const result = await dispatch(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createEmailDispatcher: missing/invalid \"to\" address -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher("fake-api-key");
    const result = await dispatch(fakeChannel({ config: { to: "not-an-email" } }), fakeOpenEvent());
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createEmailDispatcher: successful send -> ok:true, POSTs to Resend with the Bearer key and default sandbox from-address", async () => {
  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input;
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher("fake-api-key");
    const result = await dispatch(fakeChannel(), fakeOpenEvent());

    assertEquals(result, { ok: true });
    assertEquals(capturedUrl, "https://api.resend.com/emails");
    assertEquals(capturedInit?.method, "POST");
    assertEquals(
      (capturedInit?.headers as Record<string, string>)["Authorization"],
      "Bearer fake-api-key",
    );
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.from, "Upkeep <onboarding@resend.dev>");
    assertEquals(body.to, "me@example.test");
    assertEquals(body.subject, "🔴 Test Project is down");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createEmailDispatcher: a custom from-address overrides the sandbox default", async () => {
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher("fake-api-key", "Alerts <alerts@example.com>");
    await dispatch(fakeChannel(), fakeOpenEvent());
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.from, "Alerts <alerts@example.com>");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createEmailDispatcher: a non-2xx Resend response -> ok:false, includes the status, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response('{"message":"invalid api key"}', { status: 401 }))) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher("bad-key");
    const result = await dispatch(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("401"), true);
      // Never echoes the key itself back into the error message.
      assertEquals(result.error.includes("bad-key"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createEmailDispatcher: a network failure -> ok:false, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new TypeError("network error");
  }) as typeof fetch;

  try {
    const dispatch = createEmailDispatcher("fake-api-key");
    const result = await dispatch(fakeChannel(), fakeOpenEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("network error"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
