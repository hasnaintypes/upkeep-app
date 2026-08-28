// DNS check type (PRD §5.2, Phase 9, issue #56) -- resolves `health_url`
// as a bare hostname. Unlike tcp.ts, keeps the timeout-vs-other-error
// split (down vs. unknown, see classifyDns below), per this type's own
// task description asking for "the same error-vs-failure distinction the
// classifier already uses for HTTP checks" -- but skips the HTTP-only
// rules that don't apply to a bare resolution (no `http_status` to
// compare against `expected_status`, no response-time degraded/waking
// grading).
//
// See check-types.ts's own top comment for why `run`/`classify`/
// `isAttemptSuccessful` are bundled together here rather than scattered
// across check.ts/classify.ts/retry.ts as per-check-type `if` branches
// (#70's audit/refactor).
import type { CheckResult, CheckStatus, CheckTypeModule, DueProject } from "./check-types.ts";

/**
 * Resolves `check_type = 'dns'`'s overloaded `health_url` value as a bare
 * hostname (e.g. "example.com", no scheme/port) and captures whether an
 * `A` record resolution succeeded within `project.timeout_ms`. Never
 * throws, same contract as http.ts/tcp.ts -- an empty target, an
 * NXDOMAIN/SERVFAIL-style resolver error, and a timeout are all just
 * different `error_message`/`timed_out` combinations on a normal
 * CheckResult, not an exception.
 *
 * Only queries `A` (IPv4) records, deliberately -- the overwhelmingly
 * common case for a project's own health-check hostname, and matches
 * this type's "boring, extensible" scope per #56's acceptance criteria
 * (resolves-or-doesn't, not full record-type/expected-value assertions).
 * An AAAA-only hostname would be misreported as unresolvable; revisit
 * with an AAAA fallback if that turns out to matter for a real project.
 *
 * `Deno.resolveDns` (like `Deno.connect`) takes no `AbortSignal`/
 * cancellation token, so the timeout here is enforced with `Promise.race`
 * against a plain timer, same approach as tcp.ts's `runTcpCheck`. Unlike
 * a TCP connection, a DNS lookup holds no open resource to explicitly
 * close if it resolves only after the race has already timed out -- the
 * trailing `.catch` below exists solely to stop a late rejection from
 * surfacing as an unhandled-rejection warning for a promise nothing else
 * is awaiting.
 */
export async function runDnsCheck(project: DueProject): Promise<CheckResult> {
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

/** A timed-out resolution is `down`; an NXDOMAIN/SERVFAIL-style resolver
 * error that wasn't a timeout is `unknown`, not `down`, mirroring the
 * exact reasoning http.ts's `classifyHttp` uses for "the check itself
 * couldn't execute". No `degraded`/`waking` -- nothing to grade beyond
 * "did it resolve". */
export function classifyDns(result: CheckResult): CheckStatus {
  if (result.error_message !== null && !result.timed_out) {
    return "unknown";
  }
  if (result.timed_out) {
    return "down";
  }
  return "up";
}

/** Success for retry purposes is just "no error" -- same reasoning as
 * tcp.ts's `isTcpAttemptSuccessful` (no `http_status` to compare against
 * `expected_status`). */
export function isDnsAttemptSuccessful(result: CheckResult): boolean {
  return result.error_message === null;
}

export const dnsCheckType: CheckTypeModule = {
  run: runDnsCheck,
  classify: classifyDns,
  isAttemptSuccessful: isDnsAttemptSuccessful,
};
