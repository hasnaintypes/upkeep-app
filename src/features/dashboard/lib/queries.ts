import { createClient } from "@/lib/supabase/server";
import type {
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
