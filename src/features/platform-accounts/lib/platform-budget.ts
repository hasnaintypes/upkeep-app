/**
 * Converts a monthly minute budget (Platform Usage Budgets, docs/ROADMAP.md Phase 12) into a
 * check_interval_seconds / keep_alive_interval_minutes value. Deliberately an *estimate*, not a
 * measurement -- `assumedMsPerRequest` stands in for the real compute cost of one ping, which
 * Upkeep has no way to observe on a third-party host. Imported both server-side (actions.ts,
 * the authoritative write) and client-side (the "Add project" form's live preview) so the two
 * can never show different numbers -- the server always recomputes on submit rather than
 * trusting whatever the client displayed.
 *
 * Pool accounting (how much of a platform_accounts' quota is already spoken for) is a plain sum
 * of the stored budget_minutes_per_month / keep_alive_budget_minutes_per_month columns across a
 * user's projects -- see platform-accounts/lib/queries.ts -- not derived from these functions.
 */

/** Default assumed compute cost of one ping, matching platform_accounts.assumed_ms_per_request's
 * own DB default -- kept here too since the client-side live preview needs it before a real
 * account has been fetched. */
export const DEFAULT_ASSUMED_MS_PER_REQUEST = 300;

/** Average month length used for every conversion below -- a documented approximation, not a
 * per-calendar-month-accurate figure (platforms themselves bill this way too; see e.g. Render's
 * 750 "instance-hours/month" not varying by how many days are in the month). */
const ASSUMED_MONTH_MINUTES = 30 * 24 * 60;

/** Mirrors validation.ts's createProjectSchema.check_interval_seconds bounds. */
const MIN_CHECK_INTERVAL_SECONDS = 30;
const MAX_CHECK_INTERVAL_SECONDS = 86400;

/** Mirrors the projects_keep_alive_interval_minutes_range check constraint. */
const MIN_KEEP_ALIVE_INTERVAL_MINUTES = 1;
const MAX_KEEP_ALIVE_INTERVAL_MINUTES = 1440;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** How many pings a budget affords in a month, given an assumed per-ping cost. */
function requestsAllowedPerMonth(budgetMinutesPerMonth: number, assumedMsPerRequest: number): number {
  return Math.floor((budgetMinutesPerMonth * 60_000) / assumedMsPerRequest);
}

/**
 * Derives `check_interval_seconds` from a monitoring budget. A budget too small to afford even
 * one ping/month clamps to the slowest allowed interval rather than producing an invalid value --
 * the UI should warn the user long before this path is hit (via pool accounting), but the math
 * itself must stay inside the DB's own bounds no matter what.
 */
export function intervalSecondsFromBudget(
  budgetMinutesPerMonth: number,
  assumedMsPerRequest: number,
): number {
  const requests = requestsAllowedPerMonth(budgetMinutesPerMonth, assumedMsPerRequest);
  if (requests <= 0) return MAX_CHECK_INTERVAL_SECONDS;
  const seconds = Math.ceil((ASSUMED_MONTH_MINUTES * 60) / requests);
  return clamp(seconds, MIN_CHECK_INTERVAL_SECONDS, MAX_CHECK_INTERVAL_SECONDS);
}

/** Same idea as intervalSecondsFromBudget, but for keep-alive's own minute-granularity cadence. */
export function keepAliveIntervalMinutesFromBudget(
  budgetMinutesPerMonth: number,
  assumedMsPerRequest: number,
): number {
  const requests = requestsAllowedPerMonth(budgetMinutesPerMonth, assumedMsPerRequest);
  if (requests <= 0) return MAX_KEEP_ALIVE_INTERVAL_MINUTES;
  const minutes = Math.ceil(ASSUMED_MONTH_MINUTES / requests);
  return clamp(minutes, MIN_KEEP_ALIVE_INTERVAL_MINUTES, MAX_KEEP_ALIVE_INTERVAL_MINUTES);
}
