// Rate-limiting/backoff (PRD §5.2, Phase 9, issue #61): so Upkeep's own
// polling traffic doesn't keep hammering a host that's already responding
// with HTTP 429, and so that back-off period isn't itself misread as a
// real outage.
//
// Scope note: only HTTP 429 triggers backoff here, not the "configurable
// threshold of consecutive connection-level failures" the issue's task
// description also mentions -- retry.ts only ever returns the *final*
// attempt's CheckResult (see its own module comment), so distinguishing
// "every attempt failed at the connection level" from "the last attempt
// did" would need a retry.ts rework to expose per-attempt outcomes. Left
// as a follow-up; not implemented speculatively here.
//
// `status` classification is untouched (classify.ts still maps a 429 to
// plain "down", same as any other unexpected status) -- backoff is a
// scheduling concern (get_due_projects(), see the add_rate_limit_backoff
// migration) plus an incident-eligibility flag (checks.is_rate_limited,
// see incidents.ts), not a new CheckStatus value.
import type { CheckResult } from "./check.ts";

export const RATE_LIMIT_HTTP_STATUS = 429;

/** Exponential backoff base -- each additional consecutive 429 doubles the
 * wait, same "boring, extensible v1" precedent as classify.ts's
 * WAKING_THRESHOLD_MS/incidents.ts's ESCALATION_THRESHOLD. */
const BACKOFF_MULTIPLIER = 2;

/** Upper bound on how long a project can be backed off for, regardless of
 * how many consecutive 429s it's accumulated -- an hour is generous enough
 * to placate any reasonable rate limiter while still self-recovering well
 * within a day even if a host rate-limits Upkeep indefinitely. */
export const MAX_BACKOFF_SECONDS = 60 * 60;

export function isRateLimited(result: CheckResult): boolean {
  return result.http_status === RATE_LIMIT_HTTP_STATUS;
}

/** The subset of a project's config/state needed to compute its next
 * backoff window. Kept minimal and local, same reasoning as check.ts's
 * DueProject. */
export type BackoffProject = {
  check_interval_seconds: number;
  rate_limit_backoff_count: number;
};

/**
 * Seconds to back off for, given this project is about to record its
 * `rate_limit_backoff_count + 1`th consecutive rate-limit event. Grows
 * exponentially off the project's own check_interval_seconds (not a
 * global base) so a project checked every 30s and one checked every 10m
 * both back off proportionally to their own normal cadence, capped at
 * MAX_BACKOFF_SECONDS. Pure and unit-testable (rate-limit.test.ts).
 */
export function computeBackoffSeconds(project: BackoffProject): number {
  const nextCount = project.rate_limit_backoff_count + 1;
  const seconds = project.check_interval_seconds * BACKOFF_MULTIPLIER ** nextCount;
  return Math.min(seconds, MAX_BACKOFF_SECONDS);
}

/** The minimal shape this module needs from a Supabase client -- narrow and
 * structural, same reasoning as persist.ts's InsertableClient. */
export type BackoffClient = {
  from: (table: string) => {
    update: (
      values: Record<string, unknown>,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Updates one project's backoff state after a round's result is known:
 * sets/grows `rate_limit_backoff_until` on a 429 (AC1/AC2's "delayed
 * beyond its normal interval"), or clears it back to "not backed off" the
 * moment a check comes back without one (AC2's "self-resets once the
 * endpoint stops rate-limiting"). A no-op write is skipped entirely when
 * there's nothing to clear (the common case: a healthy project that's
 * never been rate-limited), so this doesn't add a write to every single
 * check the way persist.ts's own writeCheckResult does.
 *
 * Never throws -- a failure to update backoff state shouldn't take down
 * the rest of the tick (same reasoning as persist.ts's writeCheckResult),
 * logged via console.error per this project's no-silent-catch convention.
 */
export async function applyRateLimitBackoff(
  supabase: BackoffClient,
  projectId: string,
  project: BackoffProject,
  rateLimited: boolean,
): Promise<void> {
  if (rateLimited) {
    const backoffSeconds = computeBackoffSeconds(project);
    const backoffUntil = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    const { error } = await supabase
      .from("projects")
      .update({
        rate_limit_backoff_until: backoffUntil,
        rate_limit_backoff_count: project.rate_limit_backoff_count + 1,
      })
      .eq("id", projectId);

    if (error) {
      console.error(
        `[prober] failed to set rate-limit backoff for project ${projectId}: ${error.message}`,
      );
    }
    return;
  }

  if (project.rate_limit_backoff_count === 0) {
    return;
  }

  const { error } = await supabase
    .from("projects")
    .update({ rate_limit_backoff_until: null, rate_limit_backoff_count: 0 })
    .eq("id", projectId);

  if (error) {
    console.error(
      `[prober] failed to clear rate-limit backoff for project ${projectId}: ${error.message}`,
    );
  }
}
