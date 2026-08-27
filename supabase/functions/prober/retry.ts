// Retry logic before finalizing a failed check (PRD §5.2, Phase 3, issue #23:
// "retry once ... with a short delay before marking a project down, to
// avoid false positives from cold starts or transient network blips").
//
// Scope note: "success" here is a narrow, retry-only judgment (no error, and
// http_status matches the project's expected_status) -- just enough to
// decide "should I retry this attempt". It is NOT the full up/down/degraded/
// waking/unknown status classification (a separate, later Phase 3 task),
// which will also weigh response time, expected_body_match, etc.
//
// #55/#56/#57 (TCP/DNS/SSL check types): none of the three has an
// `http_status` to compare against `expected_status` (always null, see
// check.ts's runTcpCheck/runDnsCheck/runSslCheck) -- "success" for retry
// purposes is just "no error_message" for all three, mirroring
// classify.ts's own check_type branches for the same reason (even though
// classify.ts's dns/ssl branches, unlike tcp's, still distinguish
// timeout/expiring-soon from other outcomes for their own down/unknown/
// degraded splits -- none of that matters here, a retry only cares
// whether the attempt succeeded at all. A "degraded" ssl result --
// connected fine, cert just expiring soon -- correctly counts as success
// here too: retrying wouldn't change whether the cert is expiring, so
// there's nothing to retry).
import { runHealthCheck, type CheckResult, type DueProject } from "./check.ts";

/** PRD: "a short delay" -- deliberately not exponential backoff, which
 * wasn't asked for and would make retry timing harder to reason about for
 * what's meant to be a quick cold-start/blip absorber, not a resilience
 * strategy for a persistently degraded endpoint. */
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether one attempt counts as successful for retry-decision purposes. */
function isAttemptSuccessful(result: CheckResult, project: DueProject): boolean {
  if (project.check_type === "tcp" || project.check_type === "dns" || project.check_type === "ssl") {
    return result.error_message === null;
  }
  return result.error_message === null && result.http_status === project.expected_status;
}

/**
 * Retries a failed check up to `project.retry_count` additional times (so
 * `retry_count`, not a global constant, controls total attempts: 1 initial +
 * retry_count retries), with a short delay between attempts. Stops and
 * returns immediately on the first successful attempt -- a success on a
 * retry counts as an overall success, not a failure, exactly like the first
 * attempt would. If every attempt fails, returns the *last* attempt's result
 * (not the first), since that's the most current picture of the endpoint's
 * state, with `attempts` set to how many were actually made.
 *
 * Only ever returns one CheckResult per project regardless of how many
 * attempts were made internally -- retries are entirely an implementation
 * detail of this function, not something that produces multiple results for
 * a caller (e.g. a future `checks` table writer) to deal with.
 */
export async function runHealthCheckWithRetry(
  project: DueProject,
): Promise<CheckResult> {
  const maxAttempts = 1 + Math.max(0, project.retry_count);
  let result: CheckResult;
  let attempt = 1;

  for (;;) {
    result = await runHealthCheck(project);
    result.attempts = attempt;

    if (isAttemptSuccessful(result, project) || attempt >= maxAttempts) {
      return result;
    }

    await sleep(RETRY_DELAY_MS);
    attempt++;
  }
}

/**
 * Runs retry-aware health checks for every due project concurrently (not
 * sequentially) -- each project's own retry loop runs independently of the
 * others, so one project's retries/delays don't hold up a different
 * project's check within the same prober tick.
 */
export async function runHealthChecksWithRetry(
  projects: DueProject[],
): Promise<CheckResult[]> {
  const settled = await Promise.allSettled(
    projects.map(runHealthCheckWithRetry),
  );

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
          attempts: 0,
        },
  );
}
