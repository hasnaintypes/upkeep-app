// Unit tests for tls-cert.ts's hand-rolled minimal TLS 1.2 client (#57) --
// see that module's own top comment for why it exists at all instead of a
// normal TLS API call. `readDerElement`/`parseCertificateInfo` are tested
// against both a real captured certificate (example.com, fetched once via
// `node:tls` on a local machine where that API actually works, to confirm
// this parser agrees with a trusted reference) and small synthetic DER
// fixtures built by this file's own minimal DER *encoder* (the inverse of
// the parser) for scenarios a real certificate can't easily represent
// (e.g. a controlled near-term expiry date). `fetchLeafCertificateValidity`
// is tested end to end against a stubbed `Deno.connect` that plays back
// pre-built TLS record bytes -- no real network access needed.
import { assertEquals, assertThrows } from "@std/assert";
import {
  buildClientHello,
  extractLeafCertificateDer,
  fetchLeafCertificateValidity,
  parseCertificateInfo,
  readDerElement,
} from "./tls-cert.ts";

// example.com's real leaf certificate, captured via `node:tls`'s
// `getPeerCertificate(true).raw` on a local machine (confirmed there:
// valid_from "Jul 29 22:10:08 2026 GMT", valid_to "Oct 27 22:17:21 2026
// GMT") -- a stable, known-good reference fixture, not a live network
// call from this test.
const REAL_CERT_BASE64 =
  "MIID5jCCA42gAwIBAgIQBiTQqzEVWHgLfVITuWMYMTAKBggqhkjOPQQDAjBRMQswCQYDVQQGEwJVUzEYMBYGA1UECgwPU1NMIENvcnBvcmF0aW9uMSgwJgYDVQQDDB9DbG91ZGZsYXJlIFRMUyBJc3N1aW5nIEVDQyBDQSAzMB4XDTI2MDcyOTIyMTAwOFoXDTI2MTAyNzIyMTcyMVowFjEUMBIGA1UEAwwLZXhhbXBsZS5jb20wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAR2Tgmj3bLPRaVN0Vud8FEAUiMz3Z2Bd5lti39uhuvBARyn+R6JJkBCv54dlTizzaUBzLnriaPVW9uysYIJXTVio4ICgDCCAnwwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBSDA/3n9vVKTRVB9O0iFtMyCj7KZjBsBggrBgEFBQcBAQRgMF4wOQYIKwYBBQUHMAKGLWh0dHA6Ly9pLmNmLWkuc3NsLmNvbS9DbG91ZGZsYXJlLVRMUy1JLUUzLmNlcjAhBggrBgEFBQcwAYYVaHR0cDovL28uY2YtaS5zc2wuY29tMCUGA1UdEQQeMByCC2V4YW1wbGUuY29tgg0qLmV4YW1wbGUuY29tMCMGA1UdIAQcMBowCAYGZ4EMAQIBMA4GDCsGAQQBgqkwAQMBATATBgNVHSUEDDAKBggrBgEFBQcDATBTBgNVHR8ETDBKMEigRqBEhkJodHRwOi8vYy5jZi1pLnNzbC5jb20vYWU4MDFlZDFjNTViYjU3OWQ3OTIwOGIwZDc3MmFjZmI4Y2MzYTIwOC5jcmwwDgYDVR0PAQH/BAQDAgeAMA8GCSsGAQQBgtpLLAQCBQAwggEEBgorBgEEAdZ5AgQCBIH1BIHyAPAAdwCUTkOH+uzB74HzGSQmqBhlAcfTXzgCAT9yZ31VNy4Z2AAAAZ+v9sM2AAAEAwBIMEYCIQD9WFotRGzWRjLUpKu5UgFVEIW2JB7MtvZe+tocSNgcyQIhAJCFdDoCWE99JjFKSmzjeRhbiH0M3Aw+h414y9bGxT+PAHUAyKPEf8ezrbk1awE/anoSbeM6TkOlxkb5l605dZkdz5oAAAGfr/bDTAAABAMARjBEAiAKprPtjMQLlLrSks4eCDoJZ6WqekRLH6AWHSHco9LXtQIgMsRhNtbw0Gp9Q0ItZB5D/0qTzrPKMBDbJZor+NZkce4wCgYIKoZIzj0EAwIDRwAwRAIgELh9REqDsIBMBAkADWsc3iuhbkwHyfcv6w+HsjhdPcwCIDzda23fZzKA2+qG5L/k1ti5g4rk3WiJU0UbvpUGLKKv";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Minimal synthetic DER *encoder* -- the inverse of the parser, used
// only to build small test fixtures with a controlled validity window
// and issuer/subject relationship that a real captured certificate can't
// conveniently represent (e.g. "expires in 3 days from whenever this test
// happens to run"). Deliberately not a real X.509 Name/AlgorithmIdentifier
// encoder -- the parser only ever reads these fields by length, never
// decodes their contents, so a minimal opaque SEQUENCE is enough. ---
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
function derInteger(value: number): number[] {
  return derTlv(0x02, [value]);
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
function buildFakeCertDer(options: {
  notBefore: Date;
  notAfter: Date;
  selfSigned: boolean;
}): Uint8Array {
  const issuer = derOpaqueName(options.selfSigned ? "same" : "issuer");
  const subject = derOpaqueName(options.selfSigned ? "same" : "subject");
  const validity = derSequence(derUtcTime(options.notBefore), derUtcTime(options.notAfter));
  const tbsCertificate = derSequence(
    derInteger(1), // serialNumber
    derSequence(derTlv(0x06, [0x2a])), // signature AlgorithmIdentifier (opaque)
    issuer,
    validity,
    subject,
    derSequence(derTlv(0x02, [0x00])), // subjectPublicKeyInfo (opaque)
  );
  return new Uint8Array(
    derSequence(
      tbsCertificate,
      derSequence(derTlv(0x06, [0x2a])), // outer signatureAlgorithm (opaque)
      derTlv(0x03, [0x00, 0x00]), // signatureValue (opaque)
    ),
  );
}

/** Wraps a Certificate handshake message (type 11) around `certDer` inside
 * a single TLS handshake record -- everything `extractLeafCertificateDer`/
 * `fetchLeafCertificateValidity` need, since neither validates anything
 * that would normally precede it (a real ServerHello, in particular). */
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

function fakeAlertRecord(level: number, description: number): Uint8Array {
  return new Uint8Array([0x15, 0x03, 0x03, 0x00, 0x02, level, description]);
}

/** Fake `Deno.TcpConn`-shaped connection that plays back `responseChunks`
 * (in order, one per `.read()` call) -- enough of the surface
 * `fetchLeafCertificateValidity` actually uses (`write`/`read`/`close`). */
function fakeConn(responseChunks: Uint8Array[]) {
  let index = 0;
  const written: Uint8Array[] = [];
  return {
    write(data: Uint8Array) {
      written.push(data);
      return Promise.resolve(data.length);
    },
    read(buf: Uint8Array) {
      if (index >= responseChunks.length) return Promise.resolve(null);
      const chunk = responseChunks[index++];
      buf.set(chunk, 0);
      return Promise.resolve(chunk.length);
    },
    close() {},
    written,
  };
}

async function withFakeConnect<T>(
  fakeConnectImpl: typeof Deno.connect,
  run: () => Promise<T>,
): Promise<T> {
  const original = Deno.connect;
  Deno.connect = fakeConnectImpl;
  try {
    return await run();
  } finally {
    Deno.connect = original;
  }
}

Deno.test("readDerElement: short-form length", () => {
  const buf = new Uint8Array([0x02, 0x01, 0x05]); // INTEGER, length 1, value 5
  const el = readDerElement(buf, 0);
  assertEquals(el.tag, 0x02);
  assertEquals(el.valueStart, 2);
  assertEquals(el.valueEnd, 3);
});

Deno.test("readDerElement: long-form length", () => {
  const value = new Array(200).fill(0xaa);
  const buf = new Uint8Array([0x04, 0x81, 0xc8, ...value]); // OCTET STRING, long-form length 200
  const el = readDerElement(buf, 0);
  assertEquals(el.valueStart, 3);
  assertEquals(el.valueEnd, 3 + 200);
});

Deno.test("parseCertificateInfo: real captured certificate matches the reference node:tls output", () => {
  const der = decodeBase64(REAL_CERT_BASE64);
  const info = parseCertificateInfo(der);
  assertEquals(info.notBefore.toISOString(), "2026-07-29T22:10:08.000Z");
  assertEquals(info.notAfter.toISOString(), "2026-10-27T22:17:21.000Z");
  assertEquals(info.selfSigned, false);
});

Deno.test("parseCertificateInfo: synthetic self-signed certificate (issuer === subject)", () => {
  const der = buildFakeCertDer({
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2026-12-31T00:00:00Z"),
    selfSigned: true,
  });
  assertEquals(parseCertificateInfo(der).selfSigned, true);
});

Deno.test("parseCertificateInfo: synthetic non-self-signed certificate (issuer !== subject)", () => {
  const der = buildFakeCertDer({
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2026-12-31T00:00:00Z"),
    selfSigned: false,
  });
  assertEquals(parseCertificateInfo(der).selfSigned, false);
});

Deno.test("parseCertificateInfo: malformed DER throws (caught by the caller, not swallowed here)", () => {
  assertThrows(() => parseCertificateInfo(new Uint8Array([0x00, 0x00])));
});

Deno.test("buildClientHello: structure sanity", () => {
  const hello = buildClientHello("example.com");
  assertEquals(hello[0], 0x16); // record type: handshake
  assertEquals(hello[5], 0x01); // handshake type: ClientHello
  // SNI hostname bytes appear somewhere in the message.
  const text = new TextDecoder().decode(hello);
  assertEquals(text.includes("example.com"), true);
});

Deno.test("buildClientHello: never advertises TLS 1.3 support (no supported_versions extension)", () => {
  // Extension type 0x002b (supported_versions) as a 2-byte big-endian
  // sequence must not appear -- its presence is exactly what would let a
  // server negotiate TLS 1.3 instead of falling back to 1.2, defeating
  // the entire "Certificate arrives in cleartext" premise this module's
  // top comment relies on.
  const hello = buildClientHello("example.com");
  let found = false;
  for (let i = 0; i < hello.length - 1; i++) {
    if (hello[i] === 0x00 && hello[i + 1] === 0x2b) {
      found = true;
      break;
    }
  }
  assertEquals(found, false);
});

Deno.test("extractLeafCertificateDer: incomplete buffer -> null (caller reads more)", () => {
  const full = fakeCertificateRecord(decodeBase64(REAL_CERT_BASE64));
  // Only the record header + a few bytes of the handshake body --
  // deliberately truncated, simulating a Certificate message split
  // across multiple TCP reads.
  const partial = full.subarray(5, 20);
  assertEquals(extractLeafCertificateDer(partial), null);
});

Deno.test("extractLeafCertificateDer: complete buffer -> extracts exactly the leaf certificate bytes", () => {
  const certDer = decodeBase64(REAL_CERT_BASE64);
  const full = fakeCertificateRecord(certDer);
  const handshakeBytes = full.subarray(5); // strip the record-layer header
  const extracted = extractLeafCertificateDer(handshakeBytes);
  assertEquals(extracted !== null, true);
  assertEquals(Array.from(extracted!), Array.from(certDer));
});

Deno.test("fetchLeafCertificateValidity: full response in one read -> parses correctly", async () => {
  const certDer = buildFakeCertDer({
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2026-12-31T00:00:00Z"),
    selfSigned: false,
  });
  const result = await withFakeConnect(
    (() => Promise.resolve(fakeConn([fakeCertificateRecord(certDer)]))) as unknown as typeof Deno.connect,
    () => fetchLeafCertificateValidity("example.com", 443),
  );

  assertEquals(result.error, null);
  assertEquals(result.certificate?.notAfter.toISOString(), "2026-12-31T00:00:00.000Z");
  assertEquals(result.certificate?.selfSigned, false);
});

Deno.test("fetchLeafCertificateValidity: response split across multiple reads -> still parses correctly", async () => {
  const certDer = buildFakeCertDer({
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2026-12-31T00:00:00Z"),
    selfSigned: false,
  });
  const record = fakeCertificateRecord(certDer);
  const midpoint = Math.floor(record.length / 2);
  const chunks = [record.subarray(0, midpoint), record.subarray(midpoint)];

  const result = await withFakeConnect(
    (() => Promise.resolve(fakeConn(chunks))) as unknown as typeof Deno.connect,
    () => fetchLeafCertificateValidity("example.com", 443),
  );

  assertEquals(result.error, null);
  assertEquals(result.certificate?.notAfter.toISOString(), "2026-12-31T00:00:00.000Z");
});

Deno.test("fetchLeafCertificateValidity: server sends a fatal alert (e.g. TLS-1.2-only client rejected) -> error, never throws", async () => {
  const result = await withFakeConnect(
    (() => Promise.resolve(fakeConn([fakeAlertRecord(2, 70)]))) as unknown as typeof Deno.connect,
    () => fetchLeafCertificateValidity("example.com", 443),
  );

  assertEquals(result.certificate, null);
  assertEquals(result.error?.includes("fatal TLS alert"), true);
});

Deno.test("fetchLeafCertificateValidity: connection closes before any data arrives -> error, never throws", async () => {
  const result = await withFakeConnect(
    (() => Promise.resolve(fakeConn([]))) as unknown as typeof Deno.connect,
    () => fetchLeafCertificateValidity("example.com", 443),
  );

  assertEquals(result.certificate, null);
  assertEquals(result.error, "Connection closed before certificate was received.");
});

Deno.test("fetchLeafCertificateValidity: connection error -> error, never throws", async () => {
  const result = await withFakeConnect(
    (() => Promise.reject(new Error("Connection refused"))) as unknown as typeof Deno.connect,
    () => fetchLeafCertificateValidity("example.com", 443),
  );

  assertEquals(result.certificate, null);
  assertEquals(result.error, "Connection refused");
});
