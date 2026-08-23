import { createClient } from "@/lib/supabase/server";
import { CHECK_LOG_PAGE_SIZE } from "../constants";
import type {
  CheckLogCursor,
  CheckLogPage,
  CheckLogRow,
  DailyHistoryPoint,
  ProjectUptimeSummary,
  ResponseTimeRawPoint,
  ResponseTimeSeries,
  UptimeWindowKey,
} from "../types";

/**
 * Per-active-project latest status + 24h/7d/30d/90d uptime % for the
 * dashboard overview page (PRD §5.6, #29). One RPC round trip (see
 * supabase/migrations/*_create_get_project_uptime_summary_function.sql),
 * not N+1 client-side queries -- relies entirely on that function's own
 * `security invoker` + the existing `projects`/`checks`/`checks_aggregated`
 * RLS policies for scoping, the same "don't filter by user_id here"
 * convention as `getProjects` (features/projects/lib/queries.ts).
 */
export async function getProjectUptimeSummaries(): Promise<{
  data: ProjectUptimeSummary[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_uptime_summary");

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data ?? []) as unknown as ProjectUptimeSummary[], error: null };
}

/** 24h/7d read raw `checks` rows directly; 30d/90d read `checks_aggregated`
 * instead, per the issue's acceptance criteria (keeps the page fast at
 * those ranges instead of pulling e.g. 90 days x 5-minute checks). */
const RAW_WINDOWS: ReadonlySet<UptimeWindowKey> = new Set(["24h", "7d"]);

const WINDOW_HOURS: Record<UptimeWindowKey, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

/**
 * Response-time series for one project + one window, for the per-project
 * detail page's response-time graph (PRD §5.6, Phase 4, #30). Relies on
 * `checks_select_own`/`checks_aggregated_select_own` RLS for scoping --
 * same "don't re-check ownership here" convention as every other query in
 * this codebase; a foreign project id just comes back with zero rows.
 */
export async function getResponseTimeSeries(
  projectId: string,
  window: UptimeWindowKey,
): Promise<{ data: ResponseTimeSeries | null; error: string | null }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_HOURS[window] * 60 * 60 * 1000).toISOString();

  if (RAW_WINDOWS.has(window)) {
    const { data, error } = await supabase
      .from("checks")
      .select("checked_at, status, http_status, response_time_ms")
      .eq("project_id", projectId)
      .gte("checked_at", since)
      .order("checked_at", { ascending: true });

    if (error) {
      return { data: null, error: error.message };
    }

    return {
      data: {
        kind: "raw",
        points: data.map((row) => {
          // Not a meaningful latency value: a network/DNS error ("unknown"),
          // or a "down" classification with no http_status at all -- both
          // mean the elapsed-time figure is how long we waited to fail, not
          // how fast the endpoint actually responded (see classify.ts).
          const failed =
            row.status === "unknown" || (row.status === "down" && row.http_status === null);

          return {
            checkedAt: row.checked_at,
            responseTimeMs: failed ? null : row.response_time_ms,
            failed,
            status: row.status as ResponseTimeRawPoint["status"],
          };
        }),
      },
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("checks_aggregated")
    .select("period_start, avg_response_time_ms, total_checks, total_failures")
    .eq("project_id", projectId)
    .gte("period_start", since)
    .order("period_start", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      kind: "aggregated",
      points: data.map((row) => ({
        periodStart: row.period_start,
        avgResponseTimeMs: row.avg_response_time_ms,
        totalChecks: row.total_checks,
        totalFailures: row.total_failures,
      })),
    },
    error: null,
  };
}

/** Matches the issue's "at minimum the last 90 days" acceptance criterion --
 * also the SQL function's own default, passed explicitly so this isn't
 * silently dependent on that default ever staying 90. */
const HEATMAP_DAYS = 90;

/**
 * Per-day uptime history for one project's last 90 days, for the
 * per-project detail page's uptime heatmap/timeline (PRD §5.6, Phase 4,
 * #31). One RPC round trip (see
 * supabase/migrations/*_create_get_project_daily_history_function.sql) --
 * `security invoker`, scoped by the caller's own RLS on
 * `checks`/`checks_aggregated`, same as `getProjectUptimeSummaries`.
 */
export async function getProjectDailyHistory(projectId: string): Promise<{
  data: DailyHistoryPoint[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_daily_history", {
    p_project_id: projectId,
    p_days: HEATMAP_DAYS,
  });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data ?? []) as unknown as DailyHistoryPoint[], error: null };
}

const CHECK_LOG_COLUMNS =
  "id, status, http_status, response_time_ms, error_message, response_snippet, checked_at";

/**
 * One page of a project's raw check log, newest-first (PRD §5.6, Phase 4,
 * #32). Keyset (cursor) pagination on `checked_at`, not `OFFSET` -- every
 * query here is a `project_id` equality + a `checked_at` range/order, which
 * `checks_project_id_checked_at_idx (project_id, checked_at desc)` (Phase
 * 1) serves directly regardless of how deep a caller paginates, unlike
 * `OFFSET n` which gets slower to skip the further in you go.
 *
 * `hasNext`/`hasPrevious` are two cheap `limit(1)` existence checks off the
 * same index (not reused from the page's own row count) -- correct
 * regardless of navigation history, including on the very first page
 * (`hasPrevious` naturally comes back false since nothing is newer than
 * the newest row already on that page).
 */
export async function getProjectChecksPage(
  projectId: string,
  cursor?: CheckLogCursor,
): Promise<{ data: CheckLogPage | null; error: string | null }> {
  const supabase = await createClient();

  let pageQuery = supabase.from("checks").select(CHECK_LOG_COLUMNS).eq("project_id", projectId);

  if (cursor?.direction === "next") {
    pageQuery = pageQuery.lt("checked_at", cursor.checkedAt).order("checked_at", {
      ascending: false,
    });
  } else if (cursor?.direction === "previous") {
    pageQuery = pageQuery.gt("checked_at", cursor.checkedAt).order("checked_at", {
      ascending: true,
    });
  } else {
    pageQuery = pageQuery.order("checked_at", { ascending: false });
  }

  const { data, error } = await pageQuery.limit(CHECK_LOG_PAGE_SIZE);

  if (error) {
    return { data: null, error: error.message };
  }

  // "previous" fetches ascending (closest-to-cursor first) so the LIMIT
  // keeps the rows nearest the cursor -- flip back to newest-first for display.
  const rows = (cursor?.direction === "previous" ? [...data].reverse() : data) as CheckLogRow[];

  if (rows.length === 0) {
    return { data: { rows: [], hasNext: false, hasPrevious: false }, error: null };
  }

  const newest = rows[0].checked_at;
  const oldest = rows[rows.length - 1].checked_at;

  const [{ count: olderCount, error: olderError }, { count: newerCount, error: newerError }] =
    await Promise.all([
      supabase
        .from("checks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .lt("checked_at", oldest),
      supabase
        .from("checks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gt("checked_at", newest),
    ]);

  if (olderError || newerError) {
    return { data: null, error: (olderError ?? newerError)!.message };
  }

  return {
    data: {
      rows,
      hasNext: (olderCount ?? 0) > 0,
      hasPrevious: (newerCount ?? 0) > 0,
    },
    error: null,
  };
}
