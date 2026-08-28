// Rollup job orchestration (PRD §5.3, Phase 10, issue #62): for one
// granularity ("hourly" or "daily"), computes which period just completed
// and calls the matching SQL function (create_rollup_functions migration)
// to upsert that period's `checks_aggregated` rows.
//
// The actual aggregation math (uptime %, avg response time, failure
// counting) lives entirely in SQL, not here -- see
// rollup_hourly_checks/rollup_daily_checks's own comments for why. This
// module's only job is: figure out *which* period just completed (UTC
// hour/day boundary math, see previousHourStart/previousDayStart below),
// call the matching RPC with that boundary, and report the outcome --
// same "thin TS orchestration around a SQL RPC" shape as digest.ts.
//
// Trigger model: two wall-clock pg_cron schedules (see
// schedule_rollup_cron), not a due-work poll -- see that migration's own
// comment for the full reasoning and the exact timing dependency between
// the two schedules.
//
// Idempotency: delegated entirely to the SQL functions' own upsert-on-
// unique-constraint behavior (see create_rollup_functions) -- this module
// doesn't need its own retry/lock logic, a re-run for the same period is
// safe by construction.

export type RollupPeriodType = "hourly" | "daily";

/** The minimal shape this module needs from a Supabase client -- same
 * narrow, structural, `PromiseLike`-not-`Promise` convention as
 * digest.ts's own `DigestClient` (testable against a fake, no real SDK
 * needed). Both RPCs are service_role-only (see create_rollup_functions'
 * own top comment) -- this client type is never meant to be satisfied by
 * anything but `ctx.supabaseAdmin`. */
export type RollupClient = {
  rpc(
    fn: "rollup_hourly_checks",
    args: { p_period_start: string },
  ): PromiseLike<{ data: number | null; error: { message: string } | null }>;
  rpc(
    fn: "rollup_daily_checks",
    args: { p_period_start: string },
  ): PromiseLike<{ data: number | null; error: { message: string } | null }>;
};

export type RollupRunSummary = {
  period_type: RollupPeriodType;
  /** ISO instant (hourly) or ISO date-at-midnight-UTC (daily) the rollup
   * covers -- always the *start* of the completed period, matching
   * `checks_aggregated.period_start`'s own meaning. */
  period_start: string;
  rolled_up: number;
  error?: string;
};

/** Truncates `now` to the start of the most recently *completed* UTC hour
 * -- e.g. run at 14:05 rolls up [13:00, 14:00), not the still-in-progress
 * current hour. Pure function of `now` (never `new Date()` internally) so
 * it's deterministically testable. */
export function previousHourStart(now: Date): Date {
  const topOfCurrentHour = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
  );
  topOfCurrentHour.setUTCHours(topOfCurrentHour.getUTCHours() - 1);
  return topOfCurrentHour;
}

/** Truncates `now` to midnight UTC of the most recently completed UTC day
 * -- e.g. run at 00:10 on the 5th rolls up the 4th. Same "pure function of
 * `now`" determinism as previousHourStart. */
export function previousDayStart(now: Date): Date {
  const midnightToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  midnightToday.setUTCDate(midnightToday.getUTCDate() - 1);
  return midnightToday;
}

/**
 * Runs one rollup invocation for `periodType`: computes the period that
 * just completed, calls the matching SQL function, and returns a summary
 * for the Edge Function's own JSON response (observability -- same
 * "summary object" convention as digest.ts's `DigestRunSummary`). Never
 * throws -- an RPC failure is reported in the returned summary (and
 * logged), not left to bubble up as a 500 with no context.
 */
export async function runRollup(
  supabase: RollupClient,
  periodType: RollupPeriodType,
  now: Date = new Date(),
): Promise<RollupRunSummary> {
  const periodStart = periodType === "hourly" ? previousHourStart(now) : previousDayStart(now);
  const periodStartIso = periodStart.toISOString();

  const { data, error } =
    periodType === "hourly"
      ? await supabase.rpc("rollup_hourly_checks", { p_period_start: periodStartIso })
      : await supabase.rpc("rollup_daily_checks", { p_period_start: periodStartIso });

  if (error) {
    console.error(`[rollup] ${periodType} rollup for ${periodStartIso} failed: ${error.message}`);
    return { period_type: periodType, period_start: periodStartIso, rolled_up: 0, error: error.message };
  }

  return { period_type: periodType, period_start: periodStartIso, rolled_up: data ?? 0 };
}
