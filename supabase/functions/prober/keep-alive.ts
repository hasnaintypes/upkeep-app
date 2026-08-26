// Keep-alive ping scheduling (PRD §5.8, Phase 7, issue #48).
//
// Deliberately its own code path, not folded into the monitoring batch
// pipeline (check.ts -> retry.ts -> classify.ts -> persist.ts ->
// incidents.ts): a keep-alive ping's only purpose is to prevent a
// free-tier host from spinning down from inactivity -- its outcome is not
// a monitoring signal, so it must never write a `checks` row or feed
// incident open/resolve detection (docs/ROADMAP.md's Phase 7 task "verify
// keep-alive pings don't themselves generate false incidents/alerts").
// Due-ness is tracked on `projects.last_keep_alive_at` instead of the
// `checks` table `get_due_projects()` uses, keeping the two schedules --
// and their data -- fully decoupled, per PRD §5.8's own wording
// ("independent of whether monitoring/alerting is enabled").
//
// Reuses check.ts's `runHealthChecks` for the outbound request (respecting
// each project's own method/headers/body/timeout_ms) but calls it
// directly, not through retry.ts: a keep-alive ping that fails this minute
// is simply retried on the next minute's tick (see
// get_due_keep_alive_projects()'s cadence), so a bounded retry-with-
// backoff -- meant to avoid flapping a *monitoring* status -- adds nothing
// here.
//
// See index.ts's own module comment for why this intentionally runs
// outside try_acquire_prober_lock (that lock exists solely to stop the
// monitoring batch from double-processing the same due-project list, a
// concern that doesn't apply here).
//
// #50's decision, spelled out explicitly (its own acceptance criterion):
// keep-alive results are NOT written to `checks` at all -- not written and
// tagged/flagged as excludable. There is no `is_keep_alive` column or
// similar on `checks`; this module simply has no code path that inserts
// into `checks` or `incidents` in the first place (contrast with
// index.ts's monitoring path, which explicitly threads persist.ts's and
// incidents.ts's results through). That structural absence is what makes
// keep-alive-only pings incapable of producing an incident (#35) or a
// notifier dispatch (#40, which only ever polls the `incidents` table,
// never `checks` or this module) -- see keep-alive.test.ts's "(#50)"-
// labeled tests, which assert the fake client's `.from()` is only ever
// called with "projects", never "checks"/"incidents", including when the
// ping itself fails. A project with both `is_active` and
// `keep_alive_enabled` true is simply run through both this module and
// index.ts's monitoring path independently on their own separate
// schedules (`last_keep_alive_at` vs. `checks.checked_at`/
// `check_interval_seconds`) -- there is no shared state between them for
// one to "double-count" into, by construction.
import { runHealthChecks, type DueProject } from "./check.ts";

/** The minimal shape this module needs from a Supabase client -- mirrors
 * persist.ts's InsertableClient / self-monitor.ts's RpcClient: kept narrow
 * and testable against a fake, not the real generic SupabaseClient type.
 * PromiseLike (not Promise), matching InsertableClient's own comment on
 * why -- supabase-js's real `.rpc()`/`.update().in()` calls return an
 * awaitable PostgrestFilterBuilder, not a strict Promise instance. */
export type KeepAliveClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      in: (
        column: string,
        values: string[],
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type KeepAliveSummary = {
  count: number;
  pinged_project_ids: string[];
  error: string | null;
};

/**
 * Pings every project due for a keep-alive ping right now
 * (get_due_keep_alive_projects()), then stamps `last_keep_alive_at` for
 * all of them in one batch update -- regardless of each individual ping's
 * own outcome. A keep-alive ping's job is done the moment the request is
 * fired (it woke the host, or it didn't); unlike a monitoring check, there
 * is no `expected_status` gate here that would make a failed attempt worth
 * tracking differently from a successful one.
 *
 * Never throws -- any RPC/update error is caught and returned in the
 * summary instead, so a keep-alive failure can never take down the
 * monitoring batch tick running in the same invocation (see index.ts).
 */
export async function runKeepAlivePings(client: KeepAliveClient): Promise<KeepAliveSummary> {
  try {
    const { data, error } = await client.rpc("get_due_keep_alive_projects");
    if (error) {
      console.error(`[prober] failed to load due keep-alive projects: ${error.message}`);
      return { count: 0, pinged_project_ids: [], error: error.message };
    }

    const projects = (data ?? []) as unknown as DueProject[];
    if (projects.length === 0) {
      return { count: 0, pinged_project_ids: [], error: null };
    }

    await runHealthChecks(projects);

    const pingedProjectIds = projects.map((p) => p.id);
    const { error: updateError } = await client
      .from("projects")
      .update({ last_keep_alive_at: new Date().toISOString() })
      .in("id", pingedProjectIds);

    if (updateError) {
      console.error(
        `[prober] failed to stamp last_keep_alive_at for ${pingedProjectIds.length} project(s): ${updateError.message}`,
      );
      return { count: pingedProjectIds.length, pinged_project_ids: pingedProjectIds, error: updateError.message };
    }

    return { count: pingedProjectIds.length, pinged_project_ids: pingedProjectIds, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[prober] keep-alive ping run failed: ${message}`);
    return { count: 0, pinged_project_ids: [], error: message };
  }
}
