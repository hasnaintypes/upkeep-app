// Self-monitoring (PRD §8 observability requirement, Phase 3, issue #27):
// records the prober's own last-successful-run timestamp so a stalled/
// broken prober is detectable from the dashboard (Phase 4) as a stale
// timestamp, independently of any individual monitored project's status.
//
// Deliberately a single RPC call, not a raw `.from("prober_health").update()`
// -- record_prober_success() (see the record_prober_success_timestamp
// migration) is the only thing granted execute on this table's write path;
// service_role could bypass RLS and write directly, but going through the
// function keeps "how a success gets recorded" defined once in SQL rather
// than duplicated as an update() shape here.

/** The minimal shape this module needs from a Supabase client -- mirrors
 * persist.ts's InsertableClient: keeps this testable against a fake without
 * depending on supabase-js's real generic client type. */
export type RpcClient = {
  rpc: (fn: string) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Marks now() as the prober's last successful run. Never throws -- a
 * failure here logs (per CLAUDE.md/AGENTS.md's no-silent-catch convention)
 * but must not turn an otherwise-successful tick's HTTP response into an
 * error; the run itself already completed, this is just a best-effort
 * observability side effect of that success.
 *
 * Callers (index.ts) must only invoke this once the full due-check-
 * classify-persist pipeline has completed without throwing -- never from an
 * early-return error branch or from `finally` -- so a run that failed
 * partway through correctly leaves the timestamp stale.
 */
export async function recordProberSuccess(supabase: RpcClient): Promise<void> {
  const { error } = await supabase.rpc("record_prober_success");

  if (error) {
    console.error(`[prober] failed to record self-monitoring success: ${error.message}`);
  }
}
