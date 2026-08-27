// Unit tests for check.ts's TCP check type (#55) and DNS check type (#56).
// parseTcpTarget is pure and tested directly; runHealthCheck's tcp/dns
// dispatch is tested against a stubbed `Deno.connect`/`Deno.resolveDns`
// (mirroring how manual-check.test.ts/keep-alive.test.ts stub
// `globalThis.fetch` for the http path -- no real network access needed).
// The existing HTTP path (runHealthCheck without a check_type override)
// already has indirect coverage via those two files' `withFakeFetch`
// tests, so it isn't duplicated here.
import { assertEquals } from "@std/assert";
import { parseTcpTarget, runHealthCheck, type DueProject } from "./check.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "db.example.com:5432",
    method: "GET",
    headers: null,
    timeout_ms: 200,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "tcp",
    ...overrides,
  };
}

/** Temporarily replaces the global `Deno.connect` for the duration of `run`,
 * always restoring the original afterward even if `run` throws -- same
 * shape as manual-check.test.ts's own `withFakeFetch`. */
async function withFakeConnect<T>(
  fakeConnect: typeof Deno.connect,
  run: () => Promise<T>,
): Promise<T> {
  const original = Deno.connect;
  Deno.connect = fakeConnect;
  try {
    return await run();
  } finally {
    Deno.connect = original;
  }
}

/** Same shape as `withFakeConnect`, for `Deno.resolveDns` (#56). */
async function withFakeResolveDns<T>(
  fakeResolveDns: typeof Deno.resolveDns,
  run: () => Promise<T>,
): Promise<T> {
  const original = Deno.resolveDns;
  Deno.resolveDns = fakeResolveDns;
  try {
    return await run();
  } finally {
    Deno.resolveDns = original;
  }
}

Deno.test("parseTcpTarget: valid host:port", () => {
  assertEquals(parseTcpTarget("db.example.com:5432"), {
    hostname: "db.example.com",
    port: 5432,
  });
});

Deno.test("parseTcpTarget: valid bare IPv4:port", () => {
  assertEquals(parseTcpTarget("127.0.0.1:22"), { hostname: "127.0.0.1", port: 22 });
});

Deno.test("parseTcpTarget: missing port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com"), null);
});

Deno.test("parseTcpTarget: empty host -> null", () => {
  assertEquals(parseTcpTarget(":5432"), null);
});

Deno.test("parseTcpTarget: trailing colon, no port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:"), null);
});

Deno.test("parseTcpTarget: non-numeric port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:abc"), null);
});

Deno.test("parseTcpTarget: port out of range (0) -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:0"), null);
});

Deno.test("parseTcpTarget: port out of range (70000) -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:70000"), null);
});

Deno.test("runHealthCheck: tcp, successful connect -> up-shaped result (no error, null http_status)", async () => {
  let closed = false;
  const result = await withFakeConnect(
    (() =>
      Promise.resolve({
        close: () => {
          closed = true;
        },
      })) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject()),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.response_snippet, null);
  assertEquals(closed, true);
});

Deno.test("runHealthCheck: tcp, connection refused -> error_message set, not timed_out", async () => {
  const result = await withFakeConnect(
    (() => Promise.reject(new Error("Connection refused"))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject()),
  );

  assertEquals(result.error_message, "Connection refused");
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
});

Deno.test("runHealthCheck: tcp, connect never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeConnect(
    // Never resolves/rejects -- exactly the "silently dropped SYN packet"
    // case #55's acceptance criterion ("not a hung function invocation")
    // is guarding against. runTcpCheck's own timeout race (not this fake)
    // is what has to end the test in bounded time here.
    (() => new Promise(() => {})) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ timeout_ms: 50 })),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
  assertEquals(result.http_status, null);
});

Deno.test("runHealthCheck: tcp, invalid target -> error_message set, never throws", async () => {
  const result = await runHealthCheck(
    fakeProject({ health_url: "not-a-valid-target" }),
  );

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'Invalid TCP target "not-a-valid-target" -- expected "host:port".',
  );
});

Deno.test("runHealthCheck: check_type defaults to http behavior (existing projects unaffected, #55 AC)", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await runHealthCheck(fakeProject({ check_type: "http" }));
    assertEquals(fetchCalled, true);
    assertEquals(result.http_status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: dns, successful resolution -> up-shaped result (no error, null http_status)", async () => {
  const result = await withFakeResolveDns(
    (() => Promise.resolve(["93.184.216.34"])) as unknown as typeof Deno.resolveDns,
    () => runHealthCheck(fakeProject({ check_type: "dns", health_url: "example.com" })),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.response_snippet, null);
});

Deno.test("runHealthCheck: dns, NXDOMAIN-style resolver error -> error_message set, not timed_out", async () => {
  const result = await withFakeResolveDns(
    (() =>
      Promise.reject(
        new Error('proto error: no records found for Query { name: Name("bad.invalid.") }'),
      )) as unknown as typeof Deno.resolveDns,
    () => runHealthCheck(fakeProject({ check_type: "dns", health_url: "bad.invalid" })),
  );

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'proto error: no records found for Query { name: Name("bad.invalid.") }',
  );
  assertEquals(result.http_status, null);
});

Deno.test("runHealthCheck: dns, resolution never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeResolveDns(
    // Never resolves/rejects -- same "not a hung function invocation"
    // guard as the TCP timeout test above. runDnsCheck's own timeout race
    // (not this fake) is what has to end the test in bounded time here.
    (() => new Promise(() => {})) as unknown as typeof Deno.resolveDns,
    () =>
      runHealthCheck(
        fakeProject({ check_type: "dns", health_url: "example.com", timeout_ms: 50 }),
      ),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
  assertEquals(result.http_status, null);
});

Deno.test("runHealthCheck: dns, empty target -> error_message set, never throws", async () => {
  const result = await runHealthCheck(
    fakeProject({ check_type: "dns", health_url: "   " }),
  );

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'Invalid DNS target "   " -- expected a hostname.',
  );
});
