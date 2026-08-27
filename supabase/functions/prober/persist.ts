// Persisting check results to the `checks` table (PRD §5.2/§6, Phase 3, issue #25).
//
// `response_snippet` is only carried through here when the classified status
// isn't "up" -- check.ts always captures a snippet internally (useful for
// retry decisions and a future expected_body_match check), but PRD §6
// documents the column itself as "nullable, truncated body on failure", and
// there's no debugging value in storing a full 2000-char body for every
// single healthy check at whatever interval a project is configured for.
//
// `error_message` falls back to `result.jsonAssertionError` (#59) when the
// check's own `error_message` is null -- a JSON path/value assertion
// failure is a successful response (check.ts never sets `error_message`
// itself in that path), but its specific mismatch/parse-error text still
// needs to reach this column so it's visible on the persisted row and so
// incidents.ts's `deriveIncidentCause` (which reads `checks.error_message`
// directly, not CheckResult) can use it instead of falling back to a
// generic "Unexpected HTTP status" message.
//
// `region`/`is_consensus` (#60): both default to their pre-#60 values
// (`null`/`true`) so every existing call site -- manual-check.ts's single
// row, and any tick where the regional fan-out found nothing due -- keeps
// writing exactly the row shape it always has. index.ts's regionally
// fanned-out batch tick is the only caller that ever passes non-default
// values, once per per-region raw row it writes alongside its one
// consensus row (see the add_multi_region_probing migration).
import type { CheckResult } from "./check.ts";
import type { CheckStatus } from "./classify.ts";

/** The minimal shape this module needs from a Supabase client -- avoids
 * importing/typing the real SupabaseClient generic just for one insert
 * call, and keeps this testable against a fake without the real SDK. */
export type InsertableClient = {
  from: (table: string) => {
    // PromiseLike, not Promise: supabase-js's real `.insert(...)` returns a
    // PostgrestFilterBuilder -- awaitable (has `.then()`) but not a strict
    // Promise instance (no `.catch`/`.finally`). Typing this as `Promise`
    // would make the real client fail to structurally satisfy this
    // interface, caught by `deno check`, not just at runtime.
    insert: (
      values: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export type PersistResult = {
  project_id: string;
  persisted: boolean;
  /** Set when the insert itself failed (e.g. a transient Postgres error) --
   * logged via console.error by writeCheckResult, not swallowed, per
   * CLAUDE.md/AGENTS.md's no-silent-catch convention. Distinct from the
   * *check's own* error_message, which is about the health endpoint, not
   * about writing this row. */
  error?: string;
};

export type WriteCheckResultOptions = {
  /** Which region produced this result (#60) -- `null` (the default) for
   * a single/primary-region check or the one "consensus" row a regionally
   * fanned-out tick writes per project; non-null only for the N raw
   * per-region diagnostic rows written alongside that one consensus row. */
  region?: string | null;
  /** Whether this row counts toward incidents.ts's escalation/resolution
   * streak (#60) -- `true` (the default) for every pre-#60 call site and
   * for a regionally fanned-out tick's one consensus row; `false` only
   * for its N raw per-region diagnostic rows, which exist purely for
   * visibility (`checks.region` populated) and must not each
   * independently count as "this project's status this round". */
  isConsensus?: boolean;
  /** True only when this round's result was an HTTP 429 (#61, see
   * rate-limit.ts's isRateLimited) -- `false` (the default) for every
   * pre-#61 call site. incidents.ts's escalation query excludes rows with
   * this set, so Upkeep's own rate-limit backoff can never masquerade as a
   * real outage. */
  isRateLimited?: boolean;
};

/**
 * Writes one `checks` row for one project's final (post-retry, classified)
 * outcome. Never throws -- a write failure is reported in the returned
 * PersistResult (and logged) so one project's DB error can't take down the
 * rest of a concurrent batch (see writeCheckResults / index.ts).
 */
export async function writeCheckResult(
  supabase: InsertableClient,
  result: CheckResult,
  status: CheckStatus,
  options: WriteCheckResultOptions = {},
): Promise<PersistResult> {
  const { region = null, isConsensus = true, isRateLimited = false } = options;
  const { error } = await supabase.from("checks").insert({
    project_id: result.project_id,
    status,
    http_status: result.http_status,
    response_time_ms: result.response_time_ms,
    error_message: result.error_message ?? result.jsonAssertionError ?? null,
    response_snippet: status === "up" ? null : result.response_snippet,
    region,
    is_consensus: isConsensus,
    is_rate_limited: isRateLimited,
  });

  if (error) {
    // Intentionally not swallowed -- surfaces in Supabase's Edge Function
    // logs even though the HTTP response to the caller is still 200
    // overall (one project's write failure shouldn't fail the whole tick).
    console.error(
      `[prober] failed to write checks row for project ${result.project_id}: ${error.message}`,
    );
    return { project_id: result.project_id, persisted: false, error: error.message };
  }

  return { project_id: result.project_id, persisted: true };
}

/**
 * Writes one `checks` row per project concurrently -- not sequentially --
 * consistent with how due projects are checked concurrently earlier in the
 * pipeline (#21).
 */
export function writeCheckResults(
  supabase: InsertableClient,
  entries: Array<{ result: CheckResult; status: CheckStatus; options?: WriteCheckResultOptions }>,
): Promise<PersistResult[]> {
  return Promise.all(
    entries.map(({ result, status, options }) => writeCheckResult(supabase, result, status, options)),
  );
}
