// Incident auto-detection (PRD §5.4, Phase 5, issue #35): groups a sustained
// run of consecutive down/degraded checks into a single `incidents` row
// instead of leaving disconnected `checks` rows as the only record of an
// outage.
//
// Escalation threshold is the Phase 5 readiness-checklist decision recorded
// in docs/ROADMAP.md -- not invented ad hoc here, mirroring how Phase 3's
// status-classification thresholds were decided in classify.ts (#24).
// **Decided (#35): N = 2** consecutive down/degraded checks opens an
// incident -- a single blip doesn't count (PRD §5.4's "suppress noise from
// single transient blips"), but waiting for a 3rd+ would push MTTD past PRD
// §9's "under 2x the configured check interval" target. Auto-resolve (M
// consecutive `up` checks to close an incident) is Phase 5's next roadmap
// task, not this one -- this module only ever opens incidents.
//
// Only "down"/"degraded" count toward the streak, per the PRD's own wording
// ("consecutive down/degraded checks"): a "waking" check is a genuinely
// successful response (just slow, see classify.ts) and an "unknown" check
// means the request itself couldn't be classified as a real failure
// (DNS/network error) -- either one breaks an in-progress streak rather
// than extending it.
//
// This only evaluates the most recent ESCALATION_THRESHOLD checks each time
// a new one is written -- it deliberately does not backfill incidents for
// an outage that was already longer than the threshold *before* this code
// was deployed (there is no "incident detection" running retroactively over
// pre-existing `checks` rows).

export const ESCALATION_THRESHOLD = 2;

export type RecentCheck = {
  status: string;
  checked_at: string;
  http_status: number | null;
  error_message: string | null;
  response_time_ms: number | null;
};

/**
 * True only when at least `threshold` checks are on record and every one of
 * the most-recent `threshold` (already ordered newest-first) is
 * down/degraded -- i.e. this evaluation is happening on the exact check
 * that crosses the threshold, not merely "somewhere inside a longer
 * streak".
 */
export function crossesEscalationThreshold(
  recentChecksDesc: RecentCheck[],
  threshold: number = ESCALATION_THRESHOLD,
): boolean {
  if (recentChecksDesc.length < threshold) {
    return false;
  }
  return recentChecksDesc
    .slice(0, threshold)
    .every((check) => check.status === "down" || check.status === "degraded");
}

/**
 * Human-readable cause for an incident, derived from the check that started
 * the failing streak (the oldest one in the just-crossed window -- matches
 * the incident's own `started_at`), not the check that happened to trip the
 * threshold. Prefers the check's own `error_message` (already the most
 * specific signal the prober captured); falls back to a message synthesized
 * from `status`/`http_status`/`response_time_ms` for classifications that
 * don't carry an error_message (a wrong-status "down", or a slow
 * "degraded" -- see classify.ts).
 */
export function deriveIncidentCause(check: RecentCheck): string {
  if (check.error_message) {
    return check.error_message;
  }

  if (check.status === "degraded") {
    return check.response_time_ms !== null
      ? `Slow response (${check.response_time_ms}ms)`
      : "Slow response";
  }

  // status === "down" with no error_message -- a completed-but-wrong
  // response (see classify.ts), not a network/timeout failure.
  return check.http_status !== null
    ? `Unexpected HTTP status ${check.http_status}`
    : "Check failed";
}

/** The minimal shape this module needs from a Supabase client -- narrow and
 * structural, same reasoning as persist.ts's InsertableClient / manual-
 * check.ts's ProjectLookupClient: testable against a fake without the real
 * SDK, and avoids typing the full postgrest-js generic just for two query
 * shapes. */
export type IncidentClient = {
  from(table: "checks"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          opts: { ascending: boolean },
        ): {
          limit(n: number): PromiseLike<{
            data: RecentCheck[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  from(table: "incidents"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        is(
          column: string,
          value: null,
        ): {
          limit(n: number): PromiseLike<{
            data: { id: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert(values: Record<string, unknown>): PromiseLike<{
      error: { message: string } | null;
    }>;
  };
};

export type IncidentResult =
  | { opened: false; reason: "not_failing" | "below_threshold" | "already_open" }
  | { opened: false; reason: "error"; error: string }
  | { opened: true; startedAt: string; cause: string };

/**
 * Called once per project immediately after a check has just been
 * persisted (batch tick or manual "run check now" -- both write through
 * persist.ts/manual-check.ts, see index.ts). Only actually queries anything
 * when `latestStatus` itself is down/degraded -- a fresh up/waking/unknown
 * check can't possibly be crossing the threshold, so this skips the round
 * trip entirely for the common healthy case.
 */
export async function maybeOpenIncident(
  supabase: IncidentClient,
  projectId: string,
  latestStatus: string,
  threshold: number = ESCALATION_THRESHOLD,
): Promise<IncidentResult> {
  if (latestStatus !== "down" && latestStatus !== "degraded") {
    return { opened: false, reason: "not_failing" };
  }

  const { data: recentChecks, error: checksError } = await supabase
    .from("checks")
    .select("status, checked_at, http_status, error_message, response_time_ms")
    .eq("project_id", projectId)
    .order("checked_at", { ascending: false })
    .limit(threshold);

  if (checksError) {
    console.error(
      `[prober] incidents: failed to read recent checks for project ${projectId}: ${checksError.message}`,
    );
    return { opened: false, reason: "error", error: checksError.message };
  }

  if (!crossesEscalationThreshold(recentChecks ?? [], threshold)) {
    return { opened: false, reason: "below_threshold" };
  }

  const { data: openIncidents, error: openError } = await supabase
    .from("incidents")
    .select("id")
    .eq("project_id", projectId)
    .is("resolved_at", null)
    .limit(1);

  if (openError) {
    console.error(
      `[prober] incidents: failed to check for an already-open incident for project ${projectId}: ${openError.message}`,
    );
    return { opened: false, reason: "error", error: openError.message };
  }

  if (openIncidents && openIncidents.length > 0) {
    // Already tracking this outage -- auto-resolving it after M consecutive
    // `up` checks is Phase 5's next roadmap task, not this function opening
    // a second, overlapping incident for the same ongoing streak.
    return { opened: false, reason: "already_open" };
  }

  // `recentChecks` is newest-first; the oldest of the `threshold` checks
  // just confirmed as all-failing is the one that actually started the
  // outage (see the module comment: an incident's started_at must match
  // the first failed check, not the one that tripped the threshold).
  const oldestOfStreak = recentChecks![recentChecks!.length - 1];
  const startedAt = oldestOfStreak.checked_at;
  const cause = deriveIncidentCause(oldestOfStreak);

  const { error: insertError } = await supabase.from("incidents").insert({
    project_id: projectId,
    started_at: startedAt,
    cause,
  });

  if (insertError) {
    console.error(
      `[prober] incidents: failed to open incident for project ${projectId}: ${insertError.message}`,
    );
    return { opened: false, reason: "error", error: insertError.message };
  }

  return { opened: true, startedAt, cause };
}

/** Runs `maybeOpenIncident` for every classified-and-persisted result from
 * one prober tick, concurrently -- mirrors persist.ts's writeCheckResults'
 * own per-project-independent concurrency (#25). */
export async function maybeOpenIncidents(
  supabase: IncidentClient,
  entries: Array<{ project_id: string; status: string }>,
  threshold: number = ESCALATION_THRESHOLD,
): Promise<IncidentResult[]> {
  return Promise.all(
    entries.map((entry) =>
      maybeOpenIncident(supabase, entry.project_id, entry.status, threshold),
    ),
  );
}
