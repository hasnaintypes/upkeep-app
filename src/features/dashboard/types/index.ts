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

/**
 * One day's worth of uptime history for the per-project heatmap/timeline
 * (PRD §5.6, Phase 4, #31), one row of `get_project_daily_history()` (see
 * supabase/migrations/*_create_get_project_daily_history_function.sql).
 * Hand-widened from the generated RPC return type for the same reason as
 * `ProjectUptimeSummary` above -- `uptime_percentage`/`avg_response_time_ms`
 * are genuinely nullable (a day with zero checks, `source: "none"`), which
 * `returns table (...)` doesn't reflect in the generated type.
 *
 * `source` isn't rendered directly, but is why this is its own type instead
 * of reusing `ProjectUptimeSummary`'s shape -- callers can tell an
 * already-rolled-up day apart from one this query computed from raw
 * `checks` on the fly, useful for debugging/future rollup-job validation.
 */
export type DailyHistoryPoint = Omit<
  Database["public"]["Functions"]["get_project_daily_history"]["Returns"][number],
  "uptime_percentage" | "avg_response_time_ms" | "source"
> & {
  uptime_percentage: number | null;
  avg_response_time_ms: number | null;
  source: "aggregated" | "raw" | "none";
};

/**
 * One `checks` row as shown in the raw check log table (PRD §5.6, Phase 4,
 * #32). `response_snippet` is included here even though it's only ever
 * non-null on a failed check (see persist.ts's own comment on that column)
 * -- the table renders it behind an expand/detail control per row, not
 * inline, per the issue's acceptance criteria.
 */
export type CheckLogRow = {
  id: string;
  status: CheckStatus;
  http_status: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  response_snippet: string | null;
  checked_at: string;
};

/**
 * One page of a project's check log, keyset-paginated by `checked_at`
 * (#32) -- not offset-based, so a deep page against a project with
 * thousands of checks is still a single indexed range scan on
 * `checks_project_id_checked_at_idx (project_id, checked_at desc)`, not an
 * offset scan that gets slower the further you paginate.
 */
export type CheckLogPage = {
  rows: CheckLogRow[];
  hasNext: boolean;
  hasPrevious: boolean;
};

/** Which direction to paginate from a given `checked_at` cursor -- "next"
 * means older rows (further down the log), "previous" means newer rows
 * (back toward the top). */
export type CheckLogCursor = {
  checkedAt: string;
  direction: "next" | "previous";
};

/**
 * One `incidents` row (PRD §6/§5.4, Phase 5, #35-#37): auto-detected by the
 * prober (started_at/cause on open, resolved_at on auto-resolve -- see
 * supabase/functions/prober/incidents.ts), with `cause` also the target of
 * manual annotation (#37) -- the same column serves both purposes per the
 * PRD's own schema note ("nullable, auto or manually annotated"), not a
 * separate notes field. An incident is "open" iff `resolved_at` is null.
 */
export type Incident = {
  id: string;
  project_id: string;
  started_at: string;
  resolved_at: string | null;
  cause: string | null;
  notified: boolean;
};

/** Result of `updateIncidentCause` (lib/actions.ts, #37). */
export type IncidentActionResult =
  | { data: Incident; error: null }
  | { data: null; error: string };

/**
 * One page of a project's incident history, keyset-paginated by
 * `started_at` (PRD §5.4, Phase 5, #38) -- same reasoning as `CheckLogPage`:
 * a single indexed range scan on `incidents_project_id_started_at_idx
 * (project_id, started_at desc)` regardless of how deep a caller paginates,
 * not an `OFFSET` scan that gets slower the further in you go.
 */
export type IncidentPage = {
  rows: Incident[];
  hasNext: boolean;
  hasPrevious: boolean;
};

/** Which direction to paginate from a given `started_at` cursor -- "next"
 * means older incidents (further down the history), "previous" means more
 * recent ones (back toward the top). Mirrors `CheckLogCursor`. */
export type IncidentCursor = {
  startedAt: string;
  direction: "next" | "previous";
};
