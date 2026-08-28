// Unit tests for ssl.ts -- run(), classify(), and isAttemptSuccessful()
// for the SSL/TLS certificate check type (#57). run()'s own decision
// logic (expiring-soon threshold, self-signed/expired/not-yet-valid
// routing, the timeout race) is tested via a stubbed `Deno.connect`
// playing back minimal fake TLS wire bytes -- `runSslCheck` delegates the
// actual TLS wire-protocol handling to tls-cert.ts's
// `fetchLeafCertificateValidity`, which has its own much more thorough
// test suite (tls-cert.test.ts) for that layer (record/handshake
// buffering, X.509 DER parsing, alert handling, etc.), not duplicated
// here. Split out of the former check.test.ts/classify.test.ts as part
// of #70's plugin-architecture refactor.
import { assertEquals } from "@std/assert";
import { runSslCheck, classifySsl, isSslAttemptSuccessful } from "./ssl.ts";
import type { CheckResult, DueProject } from "./check-types.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "example.com:443",
    method: "GET",
    headers: null,
    timeout_ms: 200,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "ssl",
    check_interval_seconds: 300,
    rate_limit_backoff_count: 0,
    expected_body_match: null,
    expected_json_path: null,
    expected_json_value: null,
    ...overrides,
  };
}

function fakeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    project_id: "test-project",
    http_status: null,
    response_time_ms: 20,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

/** Same shape as tcp.test.ts's `withFakeConnect`. */
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

// --- Minimal fixture helpers -- same technique as tls-cert.test.ts (a fake
// Deno.TcpConn playing back pre-built TLS record bytes), scoped down to
// just what's needed to exercise runSslCheck's own decision logic rather
// than re-testing the wire protocol layer itself. See tls-cert.test.ts for
// the full DER encoder/decoder test suite. ---
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

// --- runSslCheck -------------------------------------------------------------

Deno.test("runSslCheck: valid certificate not expiring soon -> up-shaped result", async () => {
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject()),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.timed_out, false);
  assertEquals(result.http_status, null);
  assertEquals(result.certExpiringSoon, false);
  assertEquals(result.response_snippet, null);
});

Deno.test("runSslCheck: valid certificate expiring within the warning window -> certExpiringSoon, expiry captured in response_snippet", async () => {
  const notAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter,
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject()),
  );

  assertEquals(result.error_message, null);
  assertEquals(result.certExpiringSoon, true);
  // DER UTCTime has no sub-minute fraction, so compare with the seconds
  // truncated the same way parseDerTime/toISOString would.
  assertEquals(result.response_snippet?.includes(notAfter.toISOString().slice(0, 19)), true);
});

Deno.test("runSslCheck: self-signed certificate -> down-worthy error_message, not up", async () => {
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    selfSigned: true,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject()),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message, "Certificate error: self-signed certificate.");
});

Deno.test("runSslCheck: expired certificate -> down-worthy error_message, not up", async () => {
  const notAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const certDer = fakeCertDer({
    notBefore: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    notAfter,
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() =>
      Promise.resolve(fakeTlsConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject()),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message?.startsWith("Certificate error: expired on"), true);
});

Deno.test("runSslCheck: connect never settles -> times out at project.timeout_ms, not a hung invocation", async () => {
  const result = await withFakeConnect(
    (() => new Promise(() => {})) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject({ timeout_ms: 50 })),
  );

  assertEquals(result.timed_out, true);
  assertEquals(result.error_message, "Timed out after 50ms");
});

Deno.test("runSslCheck: connection-level error (refused) -> error_message set, not timed_out", async () => {
  const result = await withFakeConnect(
    (() => Promise.reject(new Error("Connection refused"))) as unknown as typeof Deno.connect,
    () => runSslCheck(fakeProject()),
  );

  assertEquals(result.timed_out, false);
  assertEquals(result.error_message, "Connection refused");
});

Deno.test("runSslCheck: invalid target -> error_message set, never throws", async () => {
  const result = await runSslCheck(fakeProject({ health_url: "not-a-valid-target" }));

  assertEquals(result.timed_out, false);
  assertEquals(
    result.error_message,
    'Invalid SSL target "not-a-valid-target" -- expected "host:port".',
  );
});

// --- classifySsl -------------------------------------------------------------
// #57: only three outcomes (up/degraded/down), no "unknown" at all. Any
// failure is `down`; a valid-but-expiring-soon certificate is `degraded`;
// otherwise `up`.

Deno.test("classifySsl: valid certificate not expiring soon -> up", () => {
  assertEquals(classifySsl(fakeResult({ certExpiringSoon: false })), "up");
});

Deno.test("classifySsl: valid certificate expiring within the warning window -> degraded, not down", () => {
  assertEquals(classifySsl(fakeResult({ certExpiringSoon: true })), "degraded");
});

Deno.test("classifySsl: invalid/expired certificate -> down", () => {
  assertEquals(
    classifySsl(fakeResult({ error_message: "Certificate error: DEPTH_ZERO_SELF_SIGNED_CERT" })),
    "down",
  );
});

Deno.test("classifySsl: connection-level error -> down, not unknown", () => {
  assertEquals(classifySsl(fakeResult({ error_message: "Connection refused" })), "down");
});

Deno.test("classifySsl: timed out -> down", () => {
  assertEquals(
    classifySsl(fakeResult({ timed_out: true, error_message: "Timed out after 5000ms" })),
    "down",
  );
});

// --- isSslAttemptSuccessful ---------------------------------------------------

Deno.test("isSslAttemptSuccessful: no error -> true", () => {
  assertEquals(isSslAttemptSuccessful(fakeResult()), true);
});

Deno.test("isSslAttemptSuccessful: certExpiringSoon but no error -> still true (nothing to retry)", () => {
  assertEquals(isSslAttemptSuccessful(fakeResult({ certExpiringSoon: true })), true);
});

Deno.test("isSslAttemptSuccessful: error set -> false", () => {
  assertEquals(
    isSslAttemptSuccessful(fakeResult({ error_message: "Certificate error: self-signed certificate." })),
    false,
  );
});
