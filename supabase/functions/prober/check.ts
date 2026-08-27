// Health-check execution (PRD §5.2, Phase 3, issues #21-#22; TCP check
// type, Phase 9, issue #55; DNS check type, Phase 9, issue #56; SSL/TLS
// certificate check type, Phase 9, issue #57; keyword/content match,
// Phase 9, issue #58; JSON path/value assertion, Phase 9, issue #59).
//
// Scope note: this module only fires the check and captures the raw
// result. It deliberately does NOT do status classification (up/down/
// degraded/waking/unknown) or retry-on-failure, and doesn't write anything
// to the `checks` table -- those are separate, later Phase 3 tasks per
// docs/ROADMAP.md, and mixing them in here would make each one harder to
// reason about and test independently.
//
// Per-project timeout enforcement (#22): each request is aborted via
// AbortController at exactly `project.timeout_ms` -- never a hardcoded
// global value -- and a timeout is reported via the distinct `timed_out`
// flag on CheckResult, not just embedded in `error_message` text. A future
// status-classification step should branch on `timed_out` directly rather
// than string-matching the message (e.g. for "unknown" vs "down").
//
// `check_type`: `runHealthCheck` below is a thin dispatcher over four
// otherwise-independent runners -- `runHttpCheck` (the original #21-#22
// implementation, unchanged), `runTcpCheck` (#55), `runDnsCheck` (#56), and
// `runSslCheck` (#57). All four produce the same `CheckResult` shape so
// classify.ts/retry.ts/persist.ts don't need to know which kind of check
// produced it -- a tcp/dns/ssl result simply always has `http_status:
// null` (nothing to grade there), exactly like an HTTP result that never
// got a response. See classify.ts's own top comment for how `check_type`
// changes status classification itself. `runSslCheck`'s own module-level
// doc comment (below) explains why it uses a hand-rolled minimal TLS
// client (tls-cert.ts) instead of a normal TLS API call.
import { fetchLeafCertificateValidity } from "./tls-cert.ts";
import { evaluateJsonAssertion } from "./json-path.ts";

/** The subset of a `projects` row this module needs. Kept minimal and
 * local rather than importing the Next.js app's generated Database type --
 * this Edge Function is a separate Deno runtime/module graph. */
export type CheckType = "http" | "tcp" | "dns" | "ssl";

export type DueProject = {
  id: string;
  health_url: string;
  method: string;
  headers: unknown;
  timeout_ms: number;
  body: string | null;
  retry_count: number;
  expected_status: number;
  check_type: CheckType;
  /** Keyword/content match check (PRD §5.2, Phase 9, issue #58) --
   * `null`/empty means "not configured", preserving every existing
   * project's current behavior unchanged (#58's own acceptance
   * criterion). Only meaningful for `check_type = "http"`; the other
   * three check types have no response body to search at all. */
  expected_body_match: string | null;
  /** JSON path/value assertion (PRD §5.2, Phase 9, issue #59) -- both
   * null/empty means "not configured", same backward-compatibility
   * precedent as `expected_body_match` above. Only meaningful for
   * `check_type = "http"`. Requires *both* fields set to run -- a path
   * with no expected value (or vice versa) is treated as unconfigured
   * rather than guessing at intent. */
  expected_json_path: string | null;
  expected_json_value: string | null;
};

export type CheckResult = {
  project_id: string;
  http_status: number | null;
  response_time_ms: number;
  response_snippet: string | null;
  error_message: string | null;
  /** True only when the request was aborted for exceeding project.timeout_ms
   * -- a structured, machine-readable signal so a later status-classification
   * step can react to "timed out" without parsing error_message text. Never
   * true alongside a successful response. */
  timed_out: boolean;
  /** How many attempts this result represents. Always 1 from runHealthCheck
   * itself (a single attempt); retry.ts overwrites this on the final result
   * it returns so callers can see whether a retry was needed (#23). */
  attempts: number;
  /** True only for `check_type = "ssl"` (#57): the certificate is currently
   * valid (`error_message` is null) but expires within
   * `SSL_EXPIRY_WARNING_DAYS` below. classify.ts uses this to produce
   * "degraded" instead of "up" without needing its own expiry math, since
   * `runSslCheck` already parsed the certificate. Optional (not just
   * `false`) so every other runner/call site can omit it entirely rather
   * than needing to touch every existing `CheckResult` literal in this
   * codebase just to add a field that means nothing for their check type. */
  certExpiringSoon?: boolean;
  /** True only when `check_type = "http"` and `project.expected_body_match`
   * is set but the *full* (untruncated) response body doesn't contain it
   * (#58) -- computed here in `runHttpCheck`, not in classify.ts, since
   * `response_snippet` is truncated to `RESPONSE_SNIPPET_MAX_LENGTH` and a
   * match string past that cutoff would otherwise produce a false
   * "missing" result. Optional, same reasoning as `certExpiringSoon`
   * above -- every other runner/outcome simply omits it. Never true when
   * `expected_body_match` is unset, by construction (#58's own backward-
   * compatibility acceptance criterion). */
  bodyMatchFailed?: boolean;
  /** True only when `check_type = "http"` and both
   * `project.expected_json_path`/`expected_json_value` are set but the
   * assertion against the *full* response body failed -- invalid JSON, an
   * unresolvable path, or a value mismatch (#59). Computed here in
   * `runHttpCheck`, same placement/reasoning as `bodyMatchFailed` above.
   * Optional, same reasoning as `certExpiringSoon`/`bodyMatchFailed` --
   * every other runner/outcome simply omits it. */
  jsonAssertionFailed?: boolean;
  /** Human-readable reason for `jsonAssertionFailed` (parse error, missing
   * path, or value mismatch), surfaced through persist.ts into the
   * persisted `checks.error_message` column and from there into
   * incidents.ts's `deriveIncidentCause` (#59's own acceptance criterion:
   * "the mismatch/parse error captured in error_message"). Deliberately
   * kept separate from this type's own `error_message` field, which
   * classify.ts's "unknown" branch treats as "the check itself couldn't
   * execute" -- reusing it here would misclassify a successful-response-
   * but-failed-assertion check as `unknown` instead of `down`. Always
   * null/undefined when `jsonAssertionFailed` is false/undefined. */
  jsonAssertionError?: string | null;
};

/** Matches the `checks.response_snippet` column's intended use (PRD §6) --
 * captured for later status classification (e.g. `expected_body_match`),
 * not stored in full to keep row sizes bounded. */
const RESPONSE_SNIPPET_MAX_LENGTH = 2000;

function toHeaderRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Parses `check_type = 'tcp'`'s overloaded `health_url` value as "host:port"
 * (e.g. "db.example.com:5432") -- exported for direct unit testing
 * (check.test.ts), and deliberately syntax-only: it does not resolve the
 * host or attempt a connection, just like the app-side
 * lib/validation.ts's tcpTargetSchema it mirrors (duplicated, not shared --
 * see that file's own comment on why an Edge Function can't import from
 * the Next.js app). Returns `null` for anything that isn't unambiguously
 * "non-empty host, colon, 1-65535 port" -- `runTcpCheck` turns a `null`
 * here into a regular (non-thrown) CheckResult failure, not an exception.
 */
export function parseTcpTarget(target: string): { hostname: string; port: number } | null {
  const separatorIndex = target.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === target.length - 1) {
    return null;
  }

  const hostname = target.slice(0, separatorIndex);
  const port = Number(target.slice(separatorIndex + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { hostname, port };
}

/**
 * Fires one health-check HTTP request and captures its raw result. Never
 * throws -- every failure mode (network error, timeout, non-2xx status)
 * resolves to a CheckResult with `error_message` set instead, so a single
 * bad project can't take down a concurrent batch (see index.ts).
 */
async function runHttpCheck(project: DueProject): Promise<CheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), project.timeout_ms);
  const startedAt = performance.now();

  try {
    const response = await fetch(project.health_url, {
      method: project.method,
      headers: toHeaderRecord(project.headers),
      // GET/HEAD requests must not carry a body -- fetch() throws
      // ("Request with GET/HEAD method cannot have body") if you try, so
      // this is only included for methods that actually support one.
      ...(project.method !== "GET" && project.method !== "HEAD" && project.body
        ? { body: project.body }
        : {}),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    // Timing intentionally stops after reading the body, not right after
    // headers arrive -- a slow-streaming response is still a slow check.
    const responseTimeMs = Math.round(performance.now() - startedAt);
    // Checked against the *full* `bodyText`, not the truncated
    // `response_snippet` below (#58) -- a match string past
    // RESPONSE_SNIPPET_MAX_LENGTH would otherwise be wrongly reported as
    // missing. `!project.expected_body_match` (unset/empty) always
    // resolves to `false` here, matching #58's own backward-compatibility
    // acceptance criterion.
    const bodyMatchFailed = project.expected_body_match
      ? !bodyText.includes(project.expected_body_match)
      : false;

    // Checked against the *full* `bodyText`, same reasoning as
    // `bodyMatchFailed` above (#59). Both `expected_json_path` and
    // `expected_json_value` must be set to run the assertion at all --
    // see `DueProject.expected_json_path`'s own doc comment.
    const jsonAssertion =
      project.expected_json_path && project.expected_json_value !== null
        ? evaluateJsonAssertion(bodyText, project.expected_json_path, project.expected_json_value)
        : null;

    return {
      project_id: project.id,
      http_status: response.status,
      response_time_ms: responseTimeMs,
      response_snippet: bodyText.slice(0, RESPONSE_SNIPPET_MAX_LENGTH) || null,
      error_message: null,
      timed_out: false,
      attempts: 1,
      bodyMatchFailed,
      jsonAssertionFailed: jsonAssertion?.failed ?? false,
      jsonAssertionError: jsonAssertion?.failed ? jsonAssertion.message : null,
    };
  } catch (err) {
    const responseTimeMs = Math.round(performance.now() - startedAt);
    // AbortError is exactly and only what our own timeout abort() produces
    // here (no other abort trigger exists in this function), so it's a
    // reliable signal that this specific failure was a timeout, not some
    // other network error (DNS failure, connection refused, TLS error, etc).
    const isTimeout = err instanceof Error && err.name === "AbortError";

    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: isTimeout
        ? `Timed out after ${project.timeout_ms}ms`
        : err instanceof Error
          ? err.message
          : "Unknown error",
      timed_out: isTimeout,
      attempts: 1,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Opens a raw TCP connection to `check_type = 'tcp'`'s "host:port" target
 * and captures whether it succeeded within `project.timeout_ms`. Never
 * throws, same contract as `runHttpCheck` -- an unparseable target, a
 * refused/unreachable connection, and a timeout are all just different
 * `error_message`/`timed_out` combinations on a normal CheckResult, not an
 * exception (#55's "not a hung function invocation" acceptance criterion).
 *
 * `Deno.connect` (unlike `fetch`) takes no `AbortSignal`/cancellation
 * token, so the timeout here is enforced with `Promise.race` against a
 * plain timer instead of an AbortController. If the connection succeeds
 * only *after* the race has already resolved via that timer, `settled`
 * (closed over by the trailing `.then` below) makes sure the now-useless
 * straggler socket still gets closed rather than leaking until the Edge
 * Function's own isolate is recycled.
 */
async function runTcpCheck(project: DueProject): Promise<CheckResult> {
  const startedAt = performance.now();
  const target = parseTcpTarget(project.health_url);

  if (!target) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: Math.round(performance.now() - startedAt),
      response_snippet: null,
      error_message: `Invalid TCP target "${project.health_url}" -- expected "host:port".`,
      timed_out: false,
      attempts: 1,
    };
  }

  let settled = false;
  const connectPromise = Deno.connect({
    hostname: target.hostname,
    port: target.port,
    transport: "tcp",
  });
  connectPromise
    .then((conn) => {
      if (settled) conn.close();
    })
    .catch(() => {
      // Deliberately swallowed -- whichever branch below actually settles
      // the race already reports the failure that matters (a timeout), and
      // this handler exists solely to stop a late rejection here from
      // surfacing as an unhandled-rejection warning for a promise nothing
      // else is still awaiting.
    });

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), project.timeout_ms);
  });

  try {
    const outcome = await Promise.race([connectPromise, timeoutPromise]);
    settled = true;
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

    outcome.close();
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: null,
      timed_out: false,
      attempts: 1,
    };
  } catch (err) {
    settled = true;
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: Math.round(performance.now() - startedAt),
      response_snippet: null,
      error_message: err instanceof Error ? err.message : "Unknown error",
      timed_out: false,
      attempts: 1,
    };
  }
}

/**
 * Resolves `check_type = 'dns'`'s overloaded `health_url` value as a bare
 * hostname (e.g. "example.com", no scheme/port) and captures whether an
 * `A` record resolution succeeded within `project.timeout_ms`. Never
 * throws, same contract as `runHttpCheck`/`runTcpCheck` -- an empty target,
 * an NXDOMAIN/SERVFAIL-style resolver error, and a timeout are all just
 * different `error_message`/`timed_out` combinations on a normal
 * CheckResult, not an exception.
 *
 * Only queries `A` (IPv4) records, deliberately -- the overwhelmingly
 * common case for a project's own health-check hostname, and matches this
 * feature's "boring, extensible" scope per #56's acceptance criteria
 * (resolves-or-doesn't, not full record-type/expected-value assertions --
 * the issue's own task description floats an *optional* expected-IP match
 * as a stretch goal, but that's not in the acceptance criteria, so it's
 * deliberately not built here rather than guessed at). An AAAA-only
 * hostname would be misreported as unresolvable; revisit with an AAAA
 * fallback if that turns out to matter for a real project.
 *
 * `Deno.resolveDns` (like `Deno.connect`) takes no `AbortSignal`/
 * cancellation token, so the timeout here is enforced with `Promise.race`
 * against a plain timer, same approach as `runTcpCheck`. Unlike a TCP
 * connection, a DNS lookup holds no open resource to explicitly close if
 * it resolves only after the race has already timed out -- the trailing
 * `.catch` below exists solely to stop a late rejection from surfacing as
 * an unhandled-rejection warning for a promise nothing else is awaiting.
 */
async function runDnsCheck(project: DueProject): Promise<CheckResult> {
  const startedAt = performance.now();
  const hostname = project.health_url.trim();

  if (!hostname) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: 0,
      response_snippet: null,
      error_message: `Invalid DNS target "${project.health_url}" -- expected a hostname.`,
      timed_out: false,
      attempts: 1,
    };
  }

  const resolvePromise = Deno.resolveDns(hostname, "A");
  resolvePromise.catch(() => {
    // Deliberately swallowed -- see this function's own doc comment.
  });

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), project.timeout_ms);
  });

  try {
    const outcome = await Promise.race([resolvePromise, timeoutPromise]);
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

    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: null,
      timed_out: false,
      attempts: 1,
    };
  } catch (err) {
    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: Math.round(performance.now() - startedAt),
      response_snippet: null,
      error_message: err instanceof Error ? err.message : "Unknown error",
      timed_out: false,
      attempts: 1,
    };
  }
}

/** How many days out from expiry an otherwise-valid certificate starts
 * producing a "degraded" check instead of "up" (#57's acceptance criterion
 * example: "e.g. 14 days"). A single global constant for v1, not a
 * per-project column -- the acceptance criteria only ask for *a*
 * configured warning window, not a per-project-configurable one, so a new
 * column would be scope creep beyond what's actually asked for here (same
 * "boring, extensible" precedent as keep-alive's own fixed 10-minute
 * cadence -- see supabase/migrations/*_add_keep_alive_scheduling.sql's
 * comment). Revisit as a per-project column if that turns out to matter
 * for a real project. */
export const SSL_EXPIRY_WARNING_DAYS = 14;

/**
 * Connects to `check_type = 'ssl'`'s "host:port" target (same format as
 * tcp -- reuses `parseTcpTarget`) and inspects the server's leaf
 * certificate via `tls-cert.ts`'s hand-rolled minimal TLS 1.2 client --
 * see that module's own top comment for exactly why a hand-rolled client
 * is necessary here at all (short version: neither Deno's stable TLS API
 * nor `node:tls` actually expose certificate details on Supabase's Edge
 * Runtime, confirmed live, not assumed). Expired/not-yet-valid/self-signed
 * -> `error_message` set (`down`, see classify.ts); valid but expiring
 * within `SSL_EXPIRY_WARNING_DAYS` -> `certExpiringSoon: true` and the
 * expiry date captured in `response_snippet` (this check type's own
 * acceptance criterion -- "the expiry date captured somewhere visible on
 * the check record"); otherwise a normal success. Never throws, same
 * contract as the other runners.
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
 * `runTcpCheck` uses for `Deno.connect`. If it resolves only after the
 * race has already timed out, it has already closed its own socket in
 * its own `finally` block by the time it does -- there is nothing left
 * for this function to clean up, unlike `runTcpCheck`'s straggler-socket
 * handling.
 */
async function runSslCheck(project: DueProject): Promise<CheckResult> {
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

/** Dispatches to the runner matching `project.check_type` -- the one thing
 * every other module in this pipeline (retry.ts/classify.ts/persist.ts)
 * calls or reasons about, so neither of them needs its own check_type
 * branch just to fire the request. */
export function runHealthCheck(project: DueProject): Promise<CheckResult> {
  if (project.check_type === "tcp") return runTcpCheck(project);
  if (project.check_type === "dns") return runDnsCheck(project);
  if (project.check_type === "ssl") return runSslCheck(project);
  return runHttpCheck(project);
}

/**
 * Runs health checks for every due project concurrently -- not
 * sequentially -- so N projects don't each pay for the others' latency
 * within one prober tick. `Promise.allSettled` (rather than `Promise.all`)
 * is defensive: `runHealthCheck` is written to never reject, but a batch
 * here still shouldn't be able to abort partway through if it somehow did.
 */
export async function runHealthChecks(
  projects: DueProject[],
): Promise<CheckResult[]> {
  const settled = await Promise.allSettled(projects.map(runHealthCheck));

  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          project_id: projects[index].id,
          http_status: null,
          response_time_ms: 0,
          response_snippet: null,
          error_message:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error",
          timed_out: false,
          attempts: 1,
        },
  );
}
