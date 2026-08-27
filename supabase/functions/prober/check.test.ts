// Unit tests for check.ts's TCP check type (#55), DNS check type (#56),
// and SSL/TLS certificate check type (#57). parseTcpTarget is pure and
// tested directly; runHealthCheck's tcp/dns/ssl dispatch is tested
// against a stubbed `Deno.connect`/`Deno.resolveDns` (mirroring how
// manual-check.test.ts/keep-alive.test.ts stub `globalThis.fetch` for the
// http path -- no real network access needed). The existing HTTP path
// (runHealthCheck without a check_type override) already has indirect
// coverage via those two files' `withFakeFetch` tests, so it isn't
// duplicated here.
//
// The ssl tests below only cover `runSslCheck`'s own decision logic
// (expiring-soon threshold, self-signed/expired/not-yet-valid routing,
// the timeout race) via a stubbed `Deno.connect` playing back minimal
// fake TLS wire bytes -- `runSslCheck` delegates the actual TLS
// wire-protocol handling to `tls-cert.ts`'s `fetchLeafCertificateValidity`,
// which has its own much more thorough test suite (tls-cert.test.ts) for
// that layer (record/handshake buffering, X.509 DER parsing, alert
// handling, etc.), not duplicated here.
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
    check_interval_seconds: 300,
    rate_limit_backoff_count: 0,
    expected_body_match: null,
    expected_json_path: null,
    expected_json_value: null,
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

// --- Minimal fixture helpers for the ssl tests below -- same technique
// as tls-cert.test.ts (a fake Deno.TcpConn playing back pre-built TLS
// record bytes), scoped down to just what's needed to exercise
// runSslCheck's own decision logic rather than re-testing the wire
// protocol layer itself. See tls-cert.test.ts for the full DER
// encoder/decoder test suite. ---
function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return [0x80 | bytes.length, ...bytes];
}
function derTlv(tag: number, value: number[]): number[] {
  return [tag, ...derLength(value.length), ...value];
}
function derSequence(...children: number[][]): number[] {
  return derTlv(0x30, children.flat());
}
function derUtcTime(date: Date): number[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const text =
    `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return derTlv(0x17, Array.from(new TextEncoder().encode(text)));
}
function derOpaqueName(label: string): number[] {
  return derSequence(derTlv(0x0c, Array.from(new TextEncoder().encode(label))));
}
function fakeCertDer(options: { notBefore: Date; notAfter: Date; selfSigned: boolean }): Uint8Array {
  const issuer = derOpaqueName(options.selfSigned ? "same" : "issuer");
  const subject = derOpaqueName(options.selfSigned ? "same" : "subject");
  const validity = derSequence(derUtcTime(options.notBefore), derUtcTime(options.notAfter));
  const tbsCertificate = derSequence(
    derTlv(0x02, [1]),
    derSequence(derTlv(0x06, [0x2a])),
    issuer,
    validity,
    subject,
    derSequence(derTlv(0x02, [0x00])),
  );
  return new Uint8Array(
    derSequence(tbsCertificate, derSequence(derTlv(0x06, [0x2a])), derTlv(0x03, [0x00, 0x00])),
  );
}
function fakeCertificateRecord(certDer: Uint8Array): Uint8Array {
  const certEntry = [
    (certDer.length >> 16) & 0xff,
    (certDer.length >> 8) & 0xff,
    certDer.length & 0xff,
    ...certDer,
  ];
  const body = [
    (certEntry.length >> 16) & 0xff,
    (certEntry.length >> 8) & 0xff,
    certEntry.length & 0xff,
    ...certEntry,
  ];
  const handshake = [
    11,
    (body.length >> 16) & 0xff,
    (body.length >> 8) & 0xff,
    body.length & 0xff,
    ...body,
  ];
  return new Uint8Array([
    0x16,
    0x03,
    0x03,
    (handshake.length >> 8) & 0xff,
    handshake.length & 0xff,
    ...handshake,
  ]);
}
/** Fake `Deno.TcpConn`-shaped connection that plays back `responseChunks`
 * (in order, one per `.read()` call, then EOF). */
function fakeTlsConn(responseChunks: Uint8Array[]) {
  let index = 0;
  return {
    write(data: Uint8Array) {
      return Promise.resolve(data.length);
    },
    read(buf: Uint8Array) {
      if (index >= responseChunks.length) return Promise.resolve(null);
      const chunk = responseChunks[index++];
      buf.set(chunk, 0);
      return Promise.resolve(chunk.length);
    },
    close() {},
  };
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

Deno.test("runHealthCheck: http, expected_body_match set and present in body -> bodyMatchFailed false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("status: ok, all systems healthy", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_body_match: "all systems healthy" }),
    );
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_body_match set but missing from body -> bodyMatchFailed true, even with matching status (#58 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("<html>maintenance page</html>", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_status: 200, expected_body_match: "all systems healthy" }),
    );
    assertEquals(result.http_status, 200);
    assertEquals(result.bodyMatchFailed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_body_match unset -> bodyMatchFailed always false (#58 backward-compat AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("anything at all", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(fakeProject({ check_type: "http", expected_body_match: null }));
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_body_match found beyond the truncated response_snippet -> still correctly matched against the full body (#58)", async () => {
  // response_snippet is truncated to 2000 chars (RESPONSE_SNIPPET_MAX_LENGTH)
  // -- the match itself must still be checked against the *full* body, not
  // that truncated snippet, or a match string past the cutoff would be
  // wrongly reported as missing.
  const padding = "x".repeat(2500);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(`${padding}all systems healthy`, { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_body_match: "all systems healthy" }),
    );
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path/value set and matching -> jsonAssertionFailed false, error_message still null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
    assertEquals(result.error_message, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path/value set but value mismatches -> jsonAssertionFailed true, mismatch captured (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "degraded" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.http_status, 200);
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError, 'JSON path "$.status" expected "ok", got "degraded".');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path set but body isn't valid JSON -> jsonAssertionFailed true, parse error captured (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("<html>not json</html>", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError?.startsWith("Response body is not valid JSON"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path set but path missing from body -> jsonAssertionFailed true (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ other: "field" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError, 'JSON path "$.status" not found in response body.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path/value unset -> jsonAssertionFailed always false (#59 backward-compat AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("anything at all", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: null, expected_json_value: null }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHealthCheck: http, expected_json_path set but expected_json_value unset -> treated as not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "down" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHealthCheck(
      fakeProject({ check_type: "http", expected_json_path: "$.status", expected_json_value: null }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
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

Deno.test("runHealthCheck: ssl, valid certificate not expiring soon -> up-shaped result", async () => {
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ check_type: "ssl", health_url: "example.com:443" })),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.certExpiringSoon, false);
  assertEquals(result.response_snippet, null);
});

Deno.test("runHealthCheck: ssl, valid certificate expiring within the warning window -> certExpiringSoon, expiry captured in response_snippet", async () => {
  const notAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter,
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ check_type: "ssl", health_url: "example.com:443" })),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.certExpiringSoon, true);
  // DER UTCTime has no sub-minute fraction, so compare with the seconds
  // truncated the same way parseDerTime/toISOString would.
  assertEquals(result.response_snippet?.includes(notAfter.toISOString().slice(0, 19)), true);
});

Deno.test("runHealthCheck: ssl, self-signed certificate -> down-worthy error_message, not up", async () => {
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    selfSigned: true,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ check_type: "ssl", health_url: "example.com:443" })),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message, "Certificate error: self-signed certificate.");
});

Deno.test("runHealthCheck: ssl, expired certificate -> down-worthy error_message, not up", async () => {
  const notAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    notAfter,
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ check_type: "ssl", health_url: "example.com:443" })),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message?.startsWith("Certificate error: expired on"), true);
});

Deno.test("runHealthCheck: ssl, connect never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeConnect(
    (() => new Promise(() => {})) as unknown as typeof Deno.connect,
    () =>
      runHealthCheck(
        fakeProject({ check_type: "ssl", health_url: "example.com:443", timeout_ms: 50 }),
      ),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
});

Deno.test("runHealthCheck: ssl, connection-level error (refused) -> error_message set, not timed_out", async () => {
  const result = await withFakeConnect(
    (() => Promise.reject(new Error("Connection refused"))) as unknown as typeof Deno.connect,
    () => runHealthCheck(fakeProject({ check_type: "ssl", health_url: "example.com:443" })),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message, "Connection refused");
});

Deno.test("runHealthCheck: ssl, invalid target -> error_message set, never throws", async () => {
  const result = await runHealthCheck(
    fakeProject({ check_type: "ssl", health_url: "not-a-valid-target" }),
  );

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'Invalid SSL target "not-a-valid-target" -- expected "host:port".',
  );
});
