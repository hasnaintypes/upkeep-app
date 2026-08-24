// Persisting check results to the `checks` table (PRD §5.2/§6, Phase 3, issue #25).
//
// `response_snippet` is only carried through here when the classified status
// isn't "up" -- check.ts always captures a snippet internally (useful for
// retry decisions and a future expected_body_match check), but PRD §6
// documents the column itself as "nullable, truncated body on failure", and
// there's no debugging value in storing a full 2000-char body for every
// single healthy check at whatever interval a project is configured for.
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
): Promise<PersistResult> {
  const { error } = await supabase.from("checks").insert({
    project_id: result.project_id,
    status,
    http_status: result.http_status,
    response_time_ms: result.response_time_ms,
    error_message: result.error_message,
    response_snippet: status === "up" ? null : result.response_snippet,
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
  entries: Array<{ result: CheckResult; status: CheckStatus }>,
): Promise<PersistResult[]> {
  return Promise.all(
    entries.map(({ result, status }) => writeCheckResult(supabase, result, status)),
  );
}
