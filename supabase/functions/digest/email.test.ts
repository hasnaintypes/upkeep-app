// Unit tests for email.ts, using a stubbed global `fetch` and an injected
// fake API key -- no real Resend account, network access, or `--allow-env`
// permission needed (same convention as ../notifier/email.test.ts).
import { assertEquals } from "@std/assert";
import { buildDigestEmailContent, createDigestEmailSender } from "./email.ts";
import type { PortfolioProject } from "./digest.ts";

function fakeProject(overrides: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    project_id: "project-1",
    project_name: "Portfolio Site",
    last_status: "up",
    last_checked_at: "2026-08-26T00:00:00.000Z",
    uptime_percentage: 99.98,
    incident_count: 0,
    ...overrides,
  };
}

// --- buildDigestEmailContent ----------------------------------------------

Deno.test("buildDigestEmailContent: no projects -> confirming empty-state content, no table", () => {
  const content = buildDigestEmailContent("daily", []);
  assertEquals(content.text.includes("no active projects"), true);
  assertEquals(content.html.includes("<table"), false);
});

Deno.test("buildDigestEmailContent: all projects up -> all-clear subject", () => {
  const content = buildDigestEmailContent("daily", [fakeProject()]);
  assertEquals(content.subject, "\u{1F7E2} Your daily Upkeep digest -- all clear");
});

Deno.test("buildDigestEmailContent: any project down -> action-needed subject", () => {
  const content = buildDigestEmailContent("weekly", [
    fakeProject({ last_status: "up" }),
    fakeProject({ project_id: "project-2", project_name: "API", last_status: "down" }),
  ]);
  assertEquals(content.subject, "\u{1F534} Your weekly Upkeep digest -- action needed");
});

Deno.test("buildDigestEmailContent: covers every project in one email, not one per project", () => {
  const content = buildDigestEmailContent("daily", [
    fakeProject({ project_id: "project-1", project_name: "Site A" }),
    fakeProject({ project_id: "project-2", project_name: "Site B" }),
    fakeProject({ project_id: "project-3", project_name: "Site C" }),
  ]);
  assertEquals(content.text.includes("Site A"), true);
  assertEquals(content.text.includes("Site B"), true);
  assertEquals(content.text.includes("Site C"), true);
});

Deno.test("buildDigestEmailContent: a project with no checks in the period shows 'no data' uptime, not a false 100%/0%", () => {
  const content = buildDigestEmailContent("daily", [fakeProject({ uptime_percentage: null })]);
  assertEquals(content.text.includes("no data"), true);
});

Deno.test("buildDigestEmailContent: includes each project's incident count", () => {
  const content = buildDigestEmailContent("weekly", [fakeProject({ incident_count: 3 })]);
  assertEquals(content.text.includes("3 incident(s)"), true);
});

Deno.test("buildDigestEmailContent: escapes HTML-unsafe characters in a project name", () => {
  const content = buildDigestEmailContent("daily", [
    fakeProject({ project_name: "<script>alert(1)</script>" }),
  ]);
  assertEquals(content.html.includes("<script>alert"), false);
  assertEquals(content.html.includes("&lt;script&gt;"), true);
});

// --- createDigestEmailSender ------------------------------------------------

Deno.test("createDigestEmailSender: no API key configured -> ok:false, never calls fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const send = createDigestEmailSender(undefined);
    const result = await send("me@example.test", buildDigestEmailContent("daily", []));
    assertEquals(result.ok, false);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createDigestEmailSender: successful send -> ok:true, POSTs to Resend with the Bearer key and default sandbox from-address", async () => {
  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input;
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const send = createDigestEmailSender("fake-api-key");
    const result = await send("me@example.test", buildDigestEmailContent("daily", [fakeProject()]));

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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createDigestEmailSender: a custom from-address overrides the sandbox default", async () => {
  let capturedInit: RequestInit | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const send = createDigestEmailSender("fake-api-key", "Alerts <alerts@example.com>");
    await send("me@example.test", buildDigestEmailContent("daily", []));
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.from, "Alerts <alerts@example.com>");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createDigestEmailSender: a non-2xx Resend response -> ok:false, includes the status, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response('{"message":"invalid api key"}', { status: 401 }))) as typeof fetch;

  try {
    const send = createDigestEmailSender("bad-key");
    const result = await send("me@example.test", buildDigestEmailContent("daily", []));
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("401"), true);
      assertEquals(result.error.includes("bad-key"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createDigestEmailSender: a network failure -> ok:false, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new TypeError("network error");
  }) as typeof fetch;

  try {
    const send = createDigestEmailSender("fake-api-key");
    const result = await send("me@example.test", buildDigestEmailContent("daily", []));
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes("network error"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
