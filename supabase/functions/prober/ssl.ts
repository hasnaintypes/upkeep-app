// SSL/TLS certificate check type (PRD §5.2, Phase 9, issue #57) --
// connects to `health_url` parsed as "host:port" (same format as tcp,
// reuses target.ts's `parseTcpTarget`) and inspects the server's leaf
// certificate via tls-cert.ts's hand-rolled minimal TLS 1.2 client (see
// that module's own top comment for exactly why a hand-rolled client is
// necessary at all). Only three outcomes -- up/degraded/down, no
// "unknown" at all (see classifySsl below), per this type's own
// acceptance criteria.
//
// See check-types.ts's own top comment for why `run`/`classify`/
// `isAttemptSuccessful` are bundled together here rather than scattered
// across check.ts/classify.ts/retry.ts as per-check-type `if` branches
// (#70's audit/refactor).
import { fetchLeafCertificateValidity } from "./tls-cert.ts";
import { parseTcpTarget } from "./target.ts";
import type { CheckResult, CheckStatus, CheckTypeModule, DueProject } from "./check-types.ts";

/** How many days out from expiry an otherwise-valid certificate starts
 * producing a "degraded" check instead of "up" (#57's acceptance criterion
 * example: "e.g. 14 days"). A single global constant for v1, not a
 * per-project column -- the acceptance criteria only ask for *a*
 * configured warning window, not a per-project-configurable one, so a new
 * column would be scope creep beyond what's actually asked for here (same
 * "boring, extensible" precedent as keep-alive's own fixed 10-minute
 * cadence). Revisit as a per-project column if that turns out to matter
 * for a real project. */
export const SSL_EXPIRY_WARNING_DAYS = 14;

/**
 * Connects to `check_type = 'ssl'`'s "host:port" target and inspects the
 * server's leaf certificate. Expired/not-yet-valid/self-signed ->
 * `error_message` set (`down`, see classifySsl below); valid but expiring
 * within `SSL_EXPIRY_WARNING_DAYS` -> `certExpiringSoon: true` and the
 * expiry date captured in `response_snippet` (this check type's own
 * acceptance criterion -- "the expiry date captured somewhere visible on
 * the check record"); otherwise a normal success. Never throws, same
 * contract as the other check types.
 *
 * Scope boundary (documented here and in tls-cert.ts, not silently
 * swallowed): this only detects expiry/not-yet-valid and self-signed
 * certificates as "invalid" -- it does not validate the certificate's
 * signature chain up to a trusted root CA (that would need a bundled
 * trust store), so a certificate signed by a real but untrusted CA, or
 * one with a hostname mismatch, is not caught by this check type.
 *
 * `fetchLeafCertificateValidity` has no timeout of its own -- enforced
 * here with `Promise.race` against a plain timer, same approach
 * tcp.ts's `runTcpCheck` uses for `Deno.connect`. If it resolves only
 * after the race has already timed out, it has already closed its own
 * socket in its own `finally` block by the time it does -- there is
 * nothing left for this function to clean up, unlike `runTcpCheck`'s
 * straggler-socket handling.
 */
export async function runSslCheck(project: DueProject): Promise<CheckResult> {
  const startedAt = performance.now();
  const target = parseTcpTarget(project.health_url);

  if (!target) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: 0,
      response_snippet: null,
      error_message: `Invalid SSL target "${project.health_url}" -- expected "host:port".`,
      timed_out: false,
      attempts: 1,
    };
  }

  const certPromise = fetchLeafCertificateValidity(target.hostname, target.port);
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), project.timeout_ms);
  });

  const outcome = await Promise.race([certPromise, timeoutPromise]);
  const responseTimeMs = Math.round(performance.now() - startedAt);

  if (outcome === "timeout") {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: `Timed out after ${project.timeout_ms}ms`,
      timed_out: true,
      attempts: 1,
    };
  }

  if (outcome.error !== null) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: outcome.error,
      timed_out: false,
      attempts: 1,
    };
  }

  const { notBefore, notAfter, selfSigned } = outcome.certificate;
  const now = Date.now();

  if (selfSigned) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: "Certificate error: self-signed certificate.",
      timed_out: false,
      attempts: 1,
    };
  }
  if (now < notBefore.getTime()) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: `Certificate error: not valid until ${notBefore.toISOString()}.`,
      timed_out: false,
      attempts: 1,
    };
  }
  if (now > notAfter.getTime()) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: `Certificate error: expired on ${notAfter.toISOString()}.`,
      timed_out: false,
      attempts: 1,
    };
  }

  const daysUntilExpiry = (notAfter.getTime() - now) / (24 * 60 * 60 * 1000);
  const expiringSoon = daysUntilExpiry <= SSL_EXPIRY_WARNING_DAYS;

  return {
    project_id: project.id,
    http_status: null,
    response_time_ms: responseTimeMs,
    response_snippet: expiringSoon
      ? `Certificate expires ${notAfter.toISOString()} (in ${Math.max(0, Math.ceil(daysUntilExpiry))} day(s)).`
      : null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    certExpiringSoon: expiringSoon,
  };
}

/** Any failure (connection error, timeout, or an invalid/expired
 * certificate -- all of which `runSslCheck` surfaces as a plain
 * `error_message`) is `down`; a valid-but-expiring-soon certificate
 * (`result.certExpiringSoon`, computed by `runSslCheck` itself) is
 * `degraded`; otherwise `up`. No `unknown` at all, per this type's own
 * acceptance criteria. */
export function classifySsl(result: CheckResult): CheckStatus {
  if (result.error_message !== null) {
    return "down";
  }
  return result.certExpiringSoon ? "degraded" : "up";
}

/** Success for retry purposes is just "no error" -- same reasoning as
 * tcp.ts/dns.ts. A "degraded" ssl result (connected fine, cert just
 * expiring soon) correctly counts as success here too: retrying wouldn't
 * change whether the cert is expiring, so there's nothing to retry. */
export function isSslAttemptSuccessful(result: CheckResult): boolean {
  return result.error_message === null;
}

export const sslCheckType: CheckTypeModule = {
  run: runSslCheck,
  classify: classifySsl,
  isAttemptSuccessful: isSslAttemptSuccessful,
};
