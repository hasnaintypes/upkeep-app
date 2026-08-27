// Incident auto-detection and auto-resolution (PRD §5.4, Phase 5, issues
// #35/#36): groups a sustained run of consecutive down/degraded checks into
// a single `incidents` row instead of leaving disconnected `checks` rows as
// the only record of an outage, then closes that same row once the project
// has recovered for a sustained run of its own.
//
// Both thresholds are the Phase 5 readiness-checklist decision recorded in
// docs/ROADMAP.md -- not invented ad hoc here, mirroring how Phase 3's
// status-classification thresholds were decided in classify.ts (#24).
// **Decided (#35/#36): N = 2** consecutive down/degraded checks opens an
// incident, **M = 2** consecutive `up` checks resolves it -- a single blip
// in either direction doesn't count (PRD §5.4's "suppress noise from single
// transient blips"), but waiting for a 3rd+ in either direction would push
// MTTD past PRD §9's "under 2x the configured check interval" target. The
// two thresholds are independent decisions that happen to share the same
// value here, not the same constant reused for both directions -- see
// AUTO_RESOLVE_THRESHOLD below.
//
// Only "down"/"degraded" count toward the failing streak (escalation), and
// only "up" counts toward the recovery streak (auto-resolve), per the PRD's
// own wording for each. A "waking" check is a genuinely successful response
// (just slow, see classify.ts) but isn't full recovery either -- it breaks
// a failing streak without resetting the recovery counter to zero the way a
// real "up" does. An "unknown" check means the request itself couldn't be
// classified as a real failure (DNS/network error) -- it breaks a failing
// streak the same way, without counting as recovery.
//
// Both directions only evaluate the most recent THRESHOLD checks each time
// a new one is written -- neither backfills for a streak that was already
// longer than its threshold *before* this code was deployed (there is no
// detection/resolution running retroactively over pre-existing `checks`
// rows).
//
// Multi-region probing (#60): both queries below filter to
// `is_consensus = true` rows only. A regionally fanned-out batch tick
// (index.ts) writes N raw per-region rows plus one consensus row per
// project per round -- only that one consensus row (a majority vote
// across regions, see region-probe.ts's deriveConsensusStatus) may count
// toward the escalation/resolution streak. Every pre-#60 row already has
// `is_consensus = true` (the column's default, see the
// add_multi_region_probing migration), so this filter is a no-op for any
// project that predates or otherwise isn't regionally probed.

export const ESCALATION_THRESHOLD = 2;

/** Independent from ESCALATION_THRESHOLD (see module comment) -- currently
 * the same value, but each can be tuned separately without affecting the
 * other. */
export const AUTO_RESOLVE_THRESHOLD = 2;

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
 * True only when at least `threshold` checks are on record and every one of
 * the most-recent `threshold` (already ordered newest-first) is `up` --
 * the auto-resolve mirror of `crossesEscalationThreshold`. Deliberately
 * strict about `"up"` specifically (not `"waking"` too): a slow-but-
 * successful response isn't the same "fully recovered" signal as a fast
 * matching one, and treating it as equivalent recovery would resolve
 * incidents earlier than the project actually stabilized.
 */
export function meetsRecoveryThreshold(
  recentChecksDesc: RecentCheck[],
  threshold: number = AUTO_RESOLVE_THRESHOLD,
): boolean {
  if (recentChecksDesc.length < threshold) {
    return false;
  }
  return recentChecksDesc.slice(0, threshold).every((check) => check.status === "up");
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

/** A chainable `.eq(...)` filter step on the `checks` query below, recursive
 * so it can be called one or more times before finally `.order(...)`ing --
 * see IncidentClient's own comment on why this needs to support both a
 * 2-eq and a 3-eq call site against the same structural type. */
type EqChain = {
  eq(column: string, value: boolean): EqChain;
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
        // Chained for `.eq("is_consensus", true)` (#60) and, on top of
        // that, `.eq("is_rate_limited", false)` (#61) -- see this module's
        // own top comment. `EqChain` is recursive (`.eq()` returns another
        // `EqChain`) so both maybeOpenIncident's 3-eq query and
        // maybeResolveIncident's 2-eq query satisfy the same structural
        // type without one forcing the other to add a filter it doesn't
        // use.
        eq(column: string, value: boolean): EqChain;
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
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type IncidentResult =
  | { opened: false; reason: "not_failing" | "below_threshold" | "already_open" }
  | { opened: false; reason: "error"; error: string }
  | { opened: true; startedAt: string; cause: string };

export type ResolutionResult =
  | { resolved: false; reason: "not_recovering" | "no_open_incident" | "below_threshold" }
  | { resolved: false; reason: "error"; error: string }
  | { resolved: true; incidentId: string; resolvedAt: string };

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
    .eq("is_consensus", true)
    // #61: a 429 response is Upkeep's own rate-limit backoff triggering,
    // not a real failure -- excluded here so it can never be one of the
    // "threshold consecutive down checks" that opens a false incident.
    .eq("is_rate_limited", false)
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
    // Already tracking this outage -- `maybeResolveIncident` is what closes
    // it (after M consecutive `up` checks), not a second, overlapping
    // incident opened here for the same ongoing streak.
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
export function maybeOpenIncidents(
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

/**
 * Called once per project immediately after a check has just been
 * persisted, same as `maybeOpenIncident` (and mutually exclusive with it in
 * practice -- a given check's status is never both `up` and down/degraded).
 * Only actually queries anything when `latestStatus` is `up`, and only
 * proceeds to the recent-checks lookup if an incident is actually open for
 * this project -- a healthy project with no incident (the common case)
 * never pays for either round trip.
 *
 * A flapping project (up, down, up, down, ...) never accumulates
 * `threshold` *consecutive* `up`s, so `meetsRecoveryThreshold` keeps
 * returning false and the same incident row stays open across every one of
 * those failures -- there is no separate "reset the counter" state to
 * maintain here, since each call re-derives the streak fresh from the
 * `checks` table itself.
 */
export async function maybeResolveIncident(
  supabase: IncidentClient,
  projectId: string,
  latestStatus: string,
  threshold: number = AUTO_RESOLVE_THRESHOLD,
): Promise<ResolutionResult> {
  if (latestStatus !== "up") {
    return { resolved: false, reason: "not_recovering" };
  }

  const { data: openIncidents, error: openError } = await supabase
    .from("incidents")
    .select("id")
    .eq("project_id", projectId)
    .is("resolved_at", null)
    .limit(1);

  if (openError) {
    console.error(
      `[prober] incidents: failed to check for an open incident to resolve for project ${projectId}: ${openError.message}`,
    );
    return { resolved: false, reason: "error", error: openError.message };
  }

  const openIncident = openIncidents?.[0];
  if (!openIncident) {
    return { resolved: false, reason: "no_open_incident" };
  }

  const { data: recentChecks, error: checksError } = await supabase
    .from("checks")
    .select("status, checked_at, http_status, error_message, response_time_ms")
    .eq("project_id", projectId)
    .eq("is_consensus", true)
    .order("checked_at", { ascending: false })
    .limit(threshold);

  if (checksError) {
    console.error(
      `[prober] incidents: failed to read recent checks while resolving project ${projectId}: ${checksError.message}`,
    );
    return { resolved: false, reason: "error", error: checksError.message };
  }

  if (!meetsRecoveryThreshold(recentChecks ?? [], threshold)) {
    return { resolved: false, reason: "below_threshold" };
  }

  // `recentChecks` is newest-first -- the newest of the `threshold` checks
  // just confirmed as all-`up` *is* this call's own `latestStatus` check,
  // i.e. the Mth consecutive success. That's the incident's end time (per
  // this issue's own AC: set once the Mth check lands, not the first
  // successful check after the failure).
  const resolvedAt = recentChecks![0].checked_at;

  const { error: updateError } = await supabase
    .from("incidents")
    .update({ resolved_at: resolvedAt })
    .eq("id", openIncident.id);

  if (updateError) {
    console.error(
      `[prober] incidents: failed to resolve incident ${openIncident.id} for project ${projectId}: ${updateError.message}`,
    );
    return { resolved: false, reason: "error", error: updateError.message };
  }

  return { resolved: true, incidentId: openIncident.id, resolvedAt };
}

/** Runs `maybeResolveIncident` for every classified-and-persisted result
 * from one prober tick, concurrently -- same reasoning as
 * `maybeOpenIncidents`. */
export function maybeResolveIncidents(
  supabase: IncidentClient,
  entries: Array<{ project_id: string; status: string }>,
  threshold: number = AUTO_RESOLVE_THRESHOLD,
): Promise<ResolutionResult[]> {
  return Promise.all(
    entries.map((entry) =>
      maybeResolveIncident(supabase, entry.project_id, entry.status, threshold),
    ),
  );
}
