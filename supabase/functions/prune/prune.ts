// Raw `checks` pruning orchestration (PRD §5.3/§10, Phase 10, issue #63):
// deletes raw check rows older than the retention window, but only once
// their containing hour has already been rolled up into `checks_aggregated`
// (see prune_raw_checks's own comment, create_prune_function migration).
//
// Same "thin TS orchestration around a SQL RPC" shape as rollup.ts/
// digest.ts -- the correctness-critical logic (the age cutoff AND the
// "already aggregated" guard) lives entirely in the SQL function, not
// here. This module's only job is calling that RPC and reporting the
// outcome.
//
// Trigger model: one wall-clock pg_cron schedule (see schedule_prune_cron),
// not a due-work poll -- pruning has no per-row "is it due" check to make
// polling useful for, it's always "prune whatever's currently eligible."
//
// Idempotency: delegated entirely to prune_raw_checks's own "delete
// matching rows" semantics -- a re-run just finds fewer (or zero) rows
// still matching, never a correctness issue, same reasoning as
// schedule_prune_cron's own "no lock needed" note.

/** PRD §10's decided retention window (also #62's rollup job's own note) --
 * the *default* `prune_raw_checks` RPC argument, not a hardcoded query
 * cutoff, so an ad hoc manual invocation (see index.ts's request body)
 * can override it without a migration. */
export const DEFAULT_RETENTION_DAYS = 7;

/** The minimal shape this module needs from a Supabase client -- same
 * narrow, structural, `PromiseLike`-not-`Promise` convention as rollup.ts's
 * own `RollupClient`. service_role-only (see create_prune_function's own
 * top comment) -- never meant to be satisfied by anything but
 * `ctx.supabaseAdmin`. */
export type PruneClient = {
  rpc(
    fn: "prune_raw_checks",
    args: { p_retention_days: number },
  ): PromiseLike<{ data: number | null; error: { message: string } | null }>;
};

export type PruneRunSummary = {
  retention_days: number;
  deleted: number;
  error?: string;
};

/**
 * Runs one pruning invocation: calls `prune_raw_checks` with
 * `retentionDays` (defaulting to PRD §10's decided 7) and returns a
 * summary for the Edge Function's own JSON response. Never throws -- an
 * RPC failure is reported in the returned summary (and logged), same
 * convention as runRollup/runDigest.
 */
export async function runPrune(
  supabase: PruneClient,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<PruneRunSummary> {
  const { data, error } = await supabase.rpc("prune_raw_checks", {
    p_retention_days: retentionDays,
  });

  if (error) {
    console.error(`[prune] pruning with retention_days=${retentionDays} failed: ${error.message}`);
    return { retention_days: retentionDays, deleted: 0, error: error.message };
  }

  return { retention_days: retentionDays, deleted: data ?? 0 };
}
