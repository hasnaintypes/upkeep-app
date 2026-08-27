// Minimal TLS 1.2 handshake, just far enough to read the server's leaf
// certificate and its validity dates (PRD §5.2, Phase 9, issue #57).
//
// Why this exists instead of a normal TLS API call: neither Deno's own
// stable `Deno.connectTls().handshake()` (only ever exposes the negotiated
// ALPN protocol, confirmed via its own type declarations and live runtime
// reflection) nor `node:tls` (Deno's Node compatibility layer) actually
// expose certificate details on Supabase's Edge Runtime -- confirmed live
// against the deployed prober function, not just assumed from docs:
// `TLSSocket.authorized` is hardcoded `true` regardless of the real
// certificate (even for badssl.com's expired/self-signed test certs), and
// `getPeerCertificate()` only ever returns `{subject, subjectaltname}`,
// never `valid_to`/`valid_from`. (Both APIs work correctly on a local
// `deno run` -- this is specifically a gap in that Edge Runtime's Node
// compatibility shim, not a Deno-wide limitation.) There is no supported,
// documented way to get a certificate's expiry date out of that runtime
// short of implementing enough of the TLS wire protocol ourselves to read
// the Certificate handshake message directly.
//
// Deliberately minimal, not a general-purpose TLS client:
//   - Advertises TLS 1.2 as the only version (no `supported_versions`
//     extension) so a TLS-1.3-capable server still negotiates 1.2, where
//     the Certificate message is sent in cleartext immediately after
//     ServerHello -- before any key exchange. This avoids needing to
//     derive session keys or decrypt anything at all: we only ever read
//     up through the Certificate message, then close the connection.
//     (A server that has fully deprecated TLS 1.2 will send a
//     `protocol_version` alert instead -- surfaced as a connection error,
//     a known, documented limitation of this minimal approach, not a bug.)
//   - Never completes the handshake (no ClientKeyExchange/Finished) --
//     nothing is encrypted or decrypted, no cryptographic operations at
//     all beyond generating the ClientHello's random bytes.
//   - Reads only the leaf (first) certificate in the chain -- enough to
//     answer "is the certificate this host is presenting currently valid
//     and not expiring soon", this check's own acceptance criteria.

const TLS_1_2 = 0x0303;
const RECORD_TYPE_HANDSHAKE = 0x16;
const RECORD_TYPE_ALERT = 0x15;
const HANDSHAKE_TYPE_CERTIFICATE = 11;

/** A broad-compatibility cipher suite list -- which one the server would
 * actually pick never matters here (the connection is abandoned right
 * after the Certificate message, long before a cipher suite would be
 * used), so this only needs to be wide enough that a real-world server
 * accepts *some* entry and proceeds with the handshake. */
const CIPHER_SUITES = [
  0xc02f, 0xc030, 0xc02b, 0xc02c, 0xc013, 0xc014, 0xc009, 0xc00a, 0x009c, 0x009d, 0x002f, 0x0035,
];

/** (HashAlgorithm, SignatureAlgorithm) pairs per RFC 5246 §7.4.1.4.1 --
 * required by most servers to select a signature scheme for the
 * ServerKeyExchange message on an ECDHE cipher suite. We never actually
 * verify that signature (there is no key exchange here at all), but
 * omitting this extension entirely causes some servers to reject the
 * handshake outright. */
const SIGNATURE_ALGORITHMS = [0x0401, 0x0501, 0x0201, 0x0403, 0x0503, 0x0601];

const SUPPORTED_GROUPS = [0x0017, 0x0018, 0x001d]; // secp256r1, secp384r1, x25519

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u24be(value: number): number[] {
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** One (type, length-prefixed) extension: `[...u16be(type), ...u16be(body.length), ...body]`. */
function extension(type: number, body: number[]): number[] {
  return [...u16be(type), ...u16be(body.length), ...body];
}

/**
 * Builds a TLS 1.2 ClientHello record (record layer + handshake header +
 * body) for `hostname` -- exported for direct unit testing. Pure
 * byte-construction, no I/O.
 */
export function buildClientHello(hostname: string): Uint8Array {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);

  const hostnameBytes = Array.from(new TextEncoder().encode(hostname));
  const sni = extension(0x0000, [
    ...u16be(hostnameBytes.length + 3),
    0x00, // name_type: host_name
    ...u16be(hostnameBytes.length),
    ...hostnameBytes,
  ]);
  const supportedGroups = extension(0x000a, [
    ...u16be(SUPPORTED_GROUPS.length * 2),
    ...SUPPORTED_GROUPS.flatMap(u16be),
  ]);
  const ecPointFormats = extension(0x000b, [1, 0x00]); // uncompressed
  const signatureAlgorithms = extension(0x000d, [
    ...u16be(SIGNATURE_ALGORITHMS.length * 2),
    ...SIGNATURE_ALGORITHMS.flatMap(u16be),
  ]);
  const extensions = [...sni, ...supportedGroups, ...ecPointFormats, ...signatureAlgorithms];

  const body = [
    ...u16be(TLS_1_2), // client_version
    ...random,
    0x00, // session_id: empty
    ...u16be(CIPHER_SUITES.length * 2),
    ...CIPHER_SUITES.flatMap(u16be),
    0x01,
    0x00, // compression_methods: [null]
    ...u16be(extensions.length),
    ...extensions,
  ];

  const handshake = [0x01 /* ClientHello */, ...u24be(body.length), ...body];
  const record = [
    RECORD_TYPE_HANDSHAKE,
    ...u16be(0x0301), // legacy record-layer version -- conventionally 1.0 even for a 1.2 handshake
    ...u16be(handshake.length),
    ...handshake,
  ];

  return new Uint8Array(record);
}

/**
 * Reads a DER tag-length-value element starting at `offset`. Supports
 * both short-form (length < 0x80) and long-form (length encoded in the
 * following 1-4 bytes) DER lengths -- everything an X.509 certificate
 * actually uses. Exported for direct unit testing.
 */
export function readDerElement(
  buf: Uint8Array,
  offset: number,
): { tag: number; valueStart: number; valueEnd: number; nextOffset: number } {
  // Explicit bounds checks throughout, deliberately -- `Uint8Array`
  // indexing past the end silently returns `undefined` rather than
  // throwing, and `undefined` arithmetic silently produces `NaN` rather
  // than a visible error. Without these checks, a truncated/malformed
  // response wouldn't throw at all -- it would produce a nonsensical
  // `Date` (e.g. `NaN` fields) instead, which `runSslCheck` could then
  // silently misreport as a real certificate. Confirmed live: the version
  // of this function without these checks did not throw on a truncated
  // 2-byte input, contrary to this function's own contract.
  if (offset < 0 || offset + 1 >= buf.length) {
    throw new Error(`DER parse error: offset ${offset} out of bounds (buffer length ${buf.length}).`);
  }

  const tag = buf[offset];
  const firstLengthByte = buf[offset + 1];
  let length: number;
  let valueStart: number;

  if (firstLengthByte < 0x80) {
    length = firstLengthByte;
    valueStart = offset + 2;
  } else {
    const numLengthBytes = firstLengthByte & 0x7f;
    if (numLengthBytes === 0 || offset + 2 + numLengthBytes > buf.length) {
      throw new Error(`DER parse error: truncated length encoding at offset ${offset}.`);
    }
    length = 0;
    for (let i = 0; i < numLengthBytes; i++) {
      length = length * 256 + buf[offset + 2 + i];
    }
    valueStart = offset + 2 + numLengthBytes;
  }

  const valueEnd = valueStart + length;
  if (valueEnd > buf.length) {
    throw new Error(
      `DER parse error: element at offset ${offset} extends beyond buffer (end ${valueEnd}, buffer length ${buf.length}).`,
    );
  }

  return { tag, valueStart, valueEnd, nextOffset: valueEnd };
}

/** DER UTCTime ("YYMMDDHHMMSSZ") or GeneralizedTime ("YYYYMMDDHHMMSSZ") ->
 * `Date`. The two-digit-year pivot (>=50 -> 19xx, <50 -> 20xx) is RFC
 * 5280 §4.1.2.5.1's own rule for UTCTime in a certificate, not a guess. */
function parseDerTime(tag: number, bytes: Uint8Array): Date {
  const text = new TextDecoder().decode(bytes);
  const isUtcTime = tag === 0x17;
  const yearDigits = isUtcTime ? 2 : 4;
  let cursor = 0;
  const readField = (digits: number) => {
    const value = Number(text.slice(cursor, cursor + digits));
    cursor += digits;
    return value;
  };

  const rawYear = readField(yearDigits);
  const year = isUtcTime ? (rawYear >= 50 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  const month = readField(2);
  const day = readField(2);
  const hour = readField(2);
  const minute = readField(2);
  const second = readField(2);

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Parses a DER-encoded X.509 certificate for its `notBefore`/`notAfter`
 * validity dates and whether it's self-signed -- exported for direct unit
 * testing against a real captured certificate's DER bytes. Walks exactly
 * the fixed path `Certificate -> TBSCertificate -> [version] ->
 * serialNumber -> signature -> issuer -> validity -> subject` per RFC
 * 5280 §4.1 -- every field except `issuer`/`validity`/`subject` is
 * skipped over by length, never actually decoded. Throws (caught by the
 * caller) on any structure this minimal walker doesn't recognize, rather
 * than guessing.
 *
 * `selfSigned` is a byte-for-byte comparison of the `issuer` and
 * `subject` `Name` fields -- exactly what "self-signed" *means*
 * structurally (the certificate asserts it was issued by itself), and
 * confirmed live to correctly flag badssl.com's self-signed test
 * certificate. This is deliberately as far as certificate *trust*
 * checking goes here: verifying a real chain of trust up to a root CA
 * would need a bundled trust store and actual signature verification,
 * well beyond this check's "read the certificate's own validity dates"
 * scope (see this module's own top comment) -- a certificate signed by an
 * untrusted-but-not-self-signed CA, or one with a hostname mismatch,
 * is not detected by this check type. That's a known, documented scope
 * boundary, not a silently swallowed gap.
 */
export function parseCertificateInfo(
  der: Uint8Array,
): { notBefore: Date; notAfter: Date; selfSigned: boolean } {
  const certificate = readDerElement(der, 0);
  const tbsCertificate = readDerElement(der, certificate.valueStart);

  let cursor = tbsCertificate.valueStart;
  let element = readDerElement(der, cursor);
  if (element.tag === 0xa0) {
    // Explicit [0] version -- present for v2/v3 certs (nearly all
    // real-world certificates), absent for v1. Skip it and advance to
    // the next field, serialNumber.
    cursor = element.nextOffset;
    element = readDerElement(der, cursor);
  }
  // `element` is now serialNumber (INTEGER) -- skip it, then `signature`
  // AlgorithmIdentifier (SEQUENCE), then `issuer` Name (SEQUENCE), then
  // `validity`, then `subject` Name (SEQUENCE).
  cursor = element.nextOffset;
  const signatureAlgorithm = readDerElement(der, cursor);
  const issuerStart = signatureAlgorithm.nextOffset;
  const issuer = readDerElement(der, issuerStart);
  const validity = readDerElement(der, issuer.nextOffset);
  const subjectStart = validity.nextOffset;
  const subject = readDerElement(der, subjectStart);

  const notBeforeEl = readDerElement(der, validity.valueStart);
  const notAfterEl = readDerElement(der, notBeforeEl.nextOffset);

  return {
    notBefore: parseDerTime(notBeforeEl.tag, der.subarray(notBeforeEl.valueStart, notBeforeEl.valueEnd)),
    notAfter: parseDerTime(notAfterEl.tag, der.subarray(notAfterEl.valueStart, notAfterEl.valueEnd)),
    selfSigned: bytesEqual(
      der.subarray(issuerStart, issuer.nextOffset),
      der.subarray(subjectStart, subject.nextOffset),
    ),
  };
}

/**
 * Scans a buffer of concatenated TLS handshake messages (record-layer
 * framing already stripped -- see `fetchLeafCertificateValidity` below)
 * for a Certificate message (handshake type 11) and extracts the DER
 * bytes of the first (leaf) certificate in its chain. Returns `null` if
 * the buffer doesn't yet contain a complete Certificate message (the
 * caller should read more bytes and try again), not an error -- a
 * Certificate message can be larger than a single TCP read.
 */
export function extractLeafCertificateDer(handshakeBuffer: Uint8Array): Uint8Array | null {
  let offset = 0;
  while (offset + 4 <= handshakeBuffer.length) {
    const type = handshakeBuffer[offset];
    const length =
      handshakeBuffer[offset + 1] * 65536 +
      handshakeBuffer[offset + 2] * 256 +
      handshakeBuffer[offset + 3];
    const bodyStart = offset + 4;
    const bodyEnd = bodyStart + length;

    if (bodyEnd > handshakeBuffer.length) {
      return null; // message not fully buffered yet
    }

    if (type === HANDSHAKE_TYPE_CERTIFICATE) {
      // Certificate body: 3-byte total-length, then a sequence of
      // (3-byte length, DER bytes) entries -- we only need the first.
      const firstCertLength =
        handshakeBuffer[bodyStart + 3] * 65536 +
        handshakeBuffer[bodyStart + 4] * 256 +
        handshakeBuffer[bodyStart + 5];
      const certStart = bodyStart + 6;
      return handshakeBuffer.subarray(certStart, certStart + firstCertLength);
    }

    offset = bodyEnd;
  }
  return null;
}

export type TlsCertificateResult =
  | { certificate: { notBefore: Date; notAfter: Date; selfSigned: boolean }; error: null }
  | { certificate: null; error: string };

/**
 * Opens a raw TCP connection to `hostname:port`, performs just enough of
 * a TLS 1.2 handshake to read the server's leaf certificate, and returns
 * its validity dates. Never throws -- every failure mode (connection
 * error, a non-TLS/unexpected response, a malformed certificate) resolves
 * to `{ certificate: null, error: string }`, matching every other runner in
 * check.ts's own "never throws" contract. Does not enforce a timeout
 * itself -- callers (see check.ts's `runSslCheck`) that need one should
 * race this against their own timer, the same way `runTcpCheck` does for
 * `Deno.connect`.
 */
export async function fetchLeafCertificateValidity(
  hostname: string,
  port: number,
): Promise<TlsCertificateResult> {
  let conn: Deno.TcpConn | null = null;
  try {
    conn = await Deno.connect({ hostname, port, transport: "tcp" });
    await conn.write(buildClientHello(hostname));

    let recordBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let handshakeBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    const readChunk = new Uint8Array(16384);

    for (;;) {
      const bytesRead = await conn.read(readChunk);
      if (bytesRead === null) {
        return { certificate: null, error: "Connection closed before certificate was received." };
      }

      recordBuffer = concat(recordBuffer, readChunk.subarray(0, bytesRead));

      // Drain every complete TLS record currently buffered.
      for (;;) {
        if (recordBuffer.length < 5) break;
        const recordType = recordBuffer[0];
        const recordLength = recordBuffer[3] * 256 + recordBuffer[4];
        const recordEnd = 5 + recordLength;
        if (recordBuffer.length < recordEnd) break;

        const payload = recordBuffer.subarray(5, recordEnd);
        recordBuffer = recordBuffer.subarray(recordEnd);

        if (recordType === RECORD_TYPE_ALERT) {
          const level = payload[0] === 2 ? "fatal" : "warning";
          return {
            certificate: null,
            error: `Server sent a ${level} TLS alert (description ${payload[1]}) -- possibly a server that requires TLS 1.3.`,
          };
        }
        if (recordType === RECORD_TYPE_HANDSHAKE) {
          handshakeBuffer = concat(handshakeBuffer, payload);
        }
      }

      const certDer = extractLeafCertificateDer(handshakeBuffer);
      if (certDer) {
        const certificate = parseCertificateInfo(certDer);
        return { certificate, error: null };
      }
    }
  } catch (err) {
    return { certificate: null, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    try {
      conn?.close();
    } catch {
      // Already closed by the peer -- nothing to clean up.
    }
  }
}

function concat(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
