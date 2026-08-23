import type { CheckStatus } from "@/features/projects";
import type { Database } from "@/lib/supabase/types";

/** The four rolling-uptime windows the overview page shows (PRD §5.6, #29). */
export type UptimeWindowKey = "24h" | "7d" | "30d" | "90d";

/**
 * One row of `get_project_uptime_summary()`'s result (see
 * supabase/migrations/*_create_get_project_uptime_summary_function.sql).
 * Hand-widened from the generated RPC return type: `supabase gen types`
 * can't tell that `last_status`/`last_checked_at`/`uptime_*` are nullable
 * from a `returns table (...)` definition (it only reflects column types,
 * not the LEFT JOINs and `case ... else null` inside the function body that
 * make every one of them possibly-null in practice -- a project with zero
 * checks ever, or zero checks within a given window).
 */
export type ProjectUptimeSummary = Omit<
  Database["public"]["Functions"]["get_project_uptime_summary"]["Returns"][number],
  "last_status" | "last_checked_at" | "uptime_24h" | "uptime_7d" | "uptime_30d" | "uptime_90d"
> & {
  last_status: CheckStatus | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  uptime_90d: number | null;
};

/**
 * One raw `checks` row's worth of response-time data, for the 24h/7d
 * windows of the per-project response-time graph (PRD §5.6, Phase 4, #30).
 * `responseTimeMs` is `null` whenever it wouldn't be a meaningful latency
 * value -- a timeout (the full timeout duration, not a real response) or a
 * network/DNS error (`status: "unknown"`, no response was ever received) --
 * `failed` flags exactly those points so the chart can render them as
 * distinct markers instead of plotting a misleading number or silently
 * dropping them.
 */
export type ResponseTimeRawPoint = {
  checkedAt: string;
  responseTimeMs: number | null;
  failed: boolean;
  status: CheckStatus;
};

/**
 * One `checks_aggregated` row's worth of response-time data, for the
 * 30d/90d windows (read from the rollup table instead of raw `checks` to
 * keep the page fast at that range -- see the issue's acceptance
 * criteria). `totalFailures` is what lets the chart distinguish periods
 * that had failures, since individual failed checks aren't available at
 * this granularity.
 */
export type ResponseTimeAggregatedPoint = {
  periodStart: string;
  avgResponseTimeMs: number;
  totalChecks: number;
  totalFailures: number;
};

/**
 * Response-time series for one project + one window (#30). A discriminated
 * union, not one flat shape -- 24h/7d ("raw") and 30d/90d ("aggregated")
 * come from different tables with genuinely different granularity (every
 * check vs. one row per rollup period), and the chart renders each kind
 * differently (per-check failure markers vs. per-period failure counts).
 */
export type ResponseTimeSeries =
  | { kind: "raw"; points: ResponseTimeRawPoint[] }
  | { kind: "aggregated"; points: ResponseTimeAggregatedPoint[] };
