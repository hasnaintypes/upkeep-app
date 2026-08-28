// TCP check type (PRD §5.2, Phase 9, issue #55) -- a bare connection
// attempt against `health_url` parsed as "host:port", with no response
// body/status/timing-quality signal to grade the way an HTTP response
// has, so this type only ever produces `up`/`down` (see classifyTcp
// below).
//
// See check-types.ts's own top comment for why `run`/`classify`/
// `isAttemptSuccessful` are bundled together here rather than scattered
// across check.ts/classify.ts/retry.ts as per-check-type `if` branches
// (#70's audit/refactor).
import { parseTcpTarget } from "./target.ts";
import type { CheckResult, CheckStatus, CheckTypeModule, DueProject } from "./check-types.ts";

/**
 * Opens a raw TCP connection to `check_type = 'tcp'`'s "host:port" target
 * and captures whether it succeeded within `project.timeout_ms`. Never
 * throws, same contract as http.ts's `runHttpCheck` -- an unparseable
 * target, a refused/unreachable connection, and a timeout are all just
 * different `error_message`/`timed_out` combinations on a normal
 * CheckResult, not an exception (#55's "not a hung function invocation"
 * acceptance criterion).
 *
 * `Deno.connect` (unlike `fetch`) takes no `AbortSignal`/cancellation
 * token, so the timeout here is enforced with `Promise.race` against a
 * plain timer instead of an AbortController. If the connection succeeds
 * only *after* the race has already resolved via that timer, `settled`
 * (closed over by the trailing `.then` below) makes sure the now-useless
 * straggler socket still gets closed rather than leaking until the Edge
 * Function's own isolate is recycled.
 */
export async function runTcpCheck(project: DueProject): Promise<CheckResult> {
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

/** A bare TCP check has no HTTP status/body to grade the way http.ts
 * does, so it's only ever `up` or `down` -- never `degraded`/`waking` (no
 * successful-but-slow concept without a body to have been slow to
 * deliver) and never `unknown` either (unlike http/dns, there's no
 * separate "reached the host but got a surprising app-level response"
 * case for a bare TCP check to distinguish from "couldn't reach it at
 * all" -- for TCP, failing to connect *is* the down signal, full stop;
 * see #55's own acceptance criterion: "An unreachable host:port produces
 * a down check"). */
export function classifyTcp(result: CheckResult): CheckStatus {
  return result.error_message === null ? "up" : "down";
}

/** Success for retry purposes is just "no error" -- there's no
 * `http_status` to compare against `expected_status` (always null, see
 * `runTcpCheck` above). */
export function isTcpAttemptSuccessful(result: CheckResult): boolean {
  return result.error_message === null;
}

export const tcpCheckType: CheckTypeModule = {
  run: runTcpCheck,
  classify: classifyTcp,
  isAttemptSuccessful: isTcpAttemptSuccessful,
};
