import { createClient } from "@/lib/supabase/server";
import { CHECK_LOG_PAGE_SIZE, INCIDENT_PAGE_SIZE } from "../constants";
import type {
  CheckLogCursor,
  CheckLogFilters,
  CheckLogPage,
  CheckLogRow,
  DailyHistoryPoint,
  GlobalIncidentFilters,
  GlobalIncidentPage,
  GlobalIncidentRow,
  Incident,
  IncidentCursor,
  IncidentPage,
  IncidentTimeRangeKey,
  PortfolioIncidentDailyPoint,
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

/**
 * Count of currently-open incidents (`resolved_at IS NULL`) across every
 * project the signed-in user owns, for the overview page's stats row. A
 * single `count: "exact", head: true` query, not a page of rows -- same
 * "don't re-check ownership here" convention as every other query in this
 * module, relying entirely on `incidents_select_own` RLS for scoping.
 */
export async function getOpenIncidentCount(): Promise<{
  data: number | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: count ?? 0, error: null };
}

/** How many days the overview page's incidents chart covers. */
const PORTFOLIO_INCIDENT_CHART_DAYS = 30;

/**
 * Per-day incidents-opened / incidents-resolved counts across every project
 * the signed-in user owns, for the overview page's incidents chart. One
 * query (no `project_id` filter -- relies on `incidents_select_own` RLS for
 * scoping, same convention as `getIncidentsPage`), bucketed in JS rather
 * than a new SQL aggregate function: incidents are a low-volume table
 * relative to `checks`/`checks_aggregated` (this app has no incident-rate
 * anywhere near the check-ingestion volume those tables see), so pulling
 * every incident that touched the last `days` days and bucketing here is
 * cheap and avoids a migration for what's a one-off page-load aggregate.
 *
 * Zero-fills every day in the range (not just days that had activity) so
 * the chart always renders a continuous, evenly-spaced axis instead of
 * gaps wherever nothing happened.
 */
export async function getPortfolioIncidentDailyCounts(
  days: number = PORTFOLIO_INCIDENT_CHART_DAYS,
): Promise<{ data: PortfolioIncidentDailyPoint[] | null; error: string | null }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  // An incident counts toward this window if it opened *or* resolved within
  // it -- one that opened before the window but resolved inside it should
  // still show up as a "resolved" data point on the day it resolved.
  const { data, error } = await supabase
    .from("incidents")
    .select("started_at, resolved_at")
    .or(`started_at.gte.${sinceIso},resolved_at.gte.${sinceIso}`);

  if (error) {
    return { data: null, error: error.message };
  }

  const buckets = new Map<string, { opened: number; resolved: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - i);
    buckets.set(day.toISOString().slice(0, 10), { opened: 0, resolved: 0 });
  }

  for (const row of data) {
    const openedDay = row.started_at.slice(0, 10);
    const openedBucket = buckets.get(openedDay);
    if (openedBucket) openedBucket.opened += 1;

    if (row.resolved_at) {
      const resolvedDay = row.resolved_at.slice(0, 10);
      const resolvedBucket = buckets.get(resolvedDay);
      if (resolvedBucket) resolvedBucket.resolved += 1;
    }
  }

  return {
    data: Array.from(buckets.entries()).map(([day, counts]) => ({ day, ...counts })),
    error: null,
  };
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

  // `period_type = 'daily'` is not optional here (#65) -- #62's rollup job
  // never deletes/consolidates the 24 hourly rows a day's checks started
  // out as once that day's own daily row is written (only raw `checks`
  // rows ever get pruned, #63); without this filter a mature 30d/90d
  // window would return both the 24 hourly rows *and* the 1 daily row for
  // every settled day (up to ~25x too many points), defeating the
  // intended one-point-per-day granularity this branch exists for.
  const { data, error } = await supabase
    .from("checks_aggregated")
    .select("period_start, avg_response_time_ms, total_checks, total_failures")
    .eq("project_id", projectId)
    .eq("period_type", "daily")
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
  "id, status, http_status, response_time_ms, error_message, response_snippet, checked_at, is_rate_limited, region, is_consensus";

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
 *
 * `filters.status`/`filters.q` are applied as real SQL predicates (an `eq`
 * and an `ilike`, respectively) to every query below, including the
 * `hasNext`/`hasPrevious` existence checks -- same reasoning as
 * `getIncidentsPage`'s own project/status/time-range filters: an unbounded,
 * server-paginated table filters at the query, not in memory, and its
 * pagination boundaries need to be computed against that same filtered set,
 * not the project's full unfiltered history. `%`/`_` in the search text are
 * escaped so a user's literal percent sign doesn't act as an `ilike`
 * wildcard.
 */
export async function getProjectChecksPage(
  projectId: string,
  filters: CheckLogFilters,
  cursor?: CheckLogCursor,
): Promise<{ data: CheckLogPage | null; error: string | null }> {
  const supabase = await createClient();
  const escapedQuery = filters.q?.replace(/[%_]/g, (char) => `\\${char}`);

  let pageQuery = supabase.from("checks").select(CHECK_LOG_COLUMNS).eq("project_id", projectId);
  if (filters.status) {
    pageQuery = pageQuery.eq("status", filters.status);
  }
  if (escapedQuery) {
    pageQuery = pageQuery.ilike("error_message", `%${escapedQuery}%`);
  }

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

  let olderQuery = supabase
    .from("checks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .lt("checked_at", oldest);
  let newerQuery = supabase
    .from("checks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gt("checked_at", newest);
  if (filters.status) {
    olderQuery = olderQuery.eq("status", filters.status);
    newerQuery = newerQuery.eq("status", filters.status);
  }
  if (escapedQuery) {
    olderQuery = olderQuery.ilike("error_message", `%${escapedQuery}%`);
    newerQuery = newerQuery.ilike("error_message", `%${escapedQuery}%`);
  }

  const [{ count: olderCount, error: olderError }, { count: newerCount, error: newerError }] =
    await Promise.all([olderQuery, newerQuery]);

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

/** Safety cap on rows a single export request can return (PRD §5.3, Phase
 * 10, #64) -- generous relative to the 7-day raw retention window (#63) at
 * any real check interval (even a 60s interval across every region a
 * multi-region-probing project fans out to stays well under this), but
 * present so one export request can't pull an unbounded number of rows if
 * pruning has ever fallen behind. */
const CHECK_EXPORT_ROW_LIMIT = 20000;

/**
 * Every raw check for one project, newest-first, for the CSV/JSON export
 * action (#64) -- same RLS-scoped `createClient()`/`checks_select_own`
 * reliance as `getProjectChecksPage` (no manual ownership filter needed),
 * just unbounded up to `CHECK_EXPORT_ROW_LIMIT` instead of one page at a
 * time, since the point of exporting is the full history a user currently
 * has, not one page of it -- same column set as the check log table shows,
 * so an export always matches what's on screen for the same project.
 */
export async function getProjectChecksForExport(
  projectId: string,
): Promise<{ data: CheckLogRow[] | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checks")
    .select(CHECK_LOG_COLUMNS)
    .eq("project_id", projectId)
    .order("checked_at", { ascending: false })
    .limit(CHECK_EXPORT_ROW_LIMIT);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as CheckLogRow[], error: null };
}

const INCIDENT_COLUMNS = "id, project_id, started_at, resolved_at, cause, notified";

/**
 * One page of a project's incident history, newest-first (PRD §5.4, Phase
 * 5, #38). Keyset (cursor) pagination on `started_at` -- same structure as
 * `getProjectChecksPage` (#32): every query here is a `project_id`
 * equality + a `started_at` range/order, which
 * `incidents_project_id_started_at_idx (project_id, started_at desc)`
 * (already created alongside the table, Phase 5) serves directly regardless
 * of how deep a caller paginates. `hasNext`/`hasPrevious` are the same
 * two-`limit(1)`-existence-check approach for the same reason (correct
 * regardless of navigation history, independent of the page's own row
 * count). Relies on `incidents_select_own` RLS for scoping, same
 * "don't re-check ownership here" convention as every other query in this
 * module.
 */
export async function getProjectIncidentsPage(
  projectId: string,
  cursor?: IncidentCursor,
): Promise<{ data: IncidentPage | null; error: string | null }> {
  const supabase = await createClient();

  let pageQuery = supabase.from("incidents").select(INCIDENT_COLUMNS).eq("project_id", projectId);

  if (cursor?.direction === "next") {
    pageQuery = pageQuery.lt("started_at", cursor.startedAt).order("started_at", {
      ascending: false,
    });
  } else if (cursor?.direction === "previous") {
    pageQuery = pageQuery.gt("started_at", cursor.startedAt).order("started_at", {
      ascending: true,
    });
  } else {
    pageQuery = pageQuery.order("started_at", { ascending: false });
  }

  const { data, error } = await pageQuery.limit(INCIDENT_PAGE_SIZE);

  if (error) {
    return { data: null, error: error.message };
  }

  // "previous" fetches ascending (closest-to-cursor first) so the LIMIT
  // keeps the rows nearest the cursor -- flip back to newest-first for display.
  const rows = (cursor?.direction === "previous" ? [...data].reverse() : data) as Incident[];

  if (rows.length === 0) {
    return { data: { rows: [], hasNext: false, hasPrevious: false }, error: null };
  }

  const newest = rows[0].started_at;
  const oldest = rows[rows.length - 1].started_at;

  const [{ count: olderCount, error: olderError }, { count: newerCount, error: newerError }] =
    await Promise.all([
      supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .lt("started_at", oldest),
      supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gt("started_at", newest),
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

const GLOBAL_INCIDENT_COLUMNS =
  "id, project_id, started_at, resolved_at, cause, notified, projects(name)";

/** Same four windows/hour-counts as `WINDOW_HOURS` above, but kept as its
 * own map -- `IncidentTimeRangeKey` is a distinct type from
 * `UptimeWindowKey` (see its own doc comment in types/index.ts), and this
 * query filters `incidents.started_at`, not a rolling-uptime aggregation. */
const INCIDENT_TIME_RANGE_HOURS: Record<IncidentTimeRangeKey, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

/** One row of `getIncidentsPage`'s raw Supabase result -- the embedded
 * `projects(name)` relationship (via `incidents_project_id_fkey`) comes
 * back nested rather than flattened. */
type RawGlobalIncidentRow = Incident & { projects: { name: string } | null };

/**
 * One page of incidents across *every* project the signed-in user owns
 * (PRD §5.4, Phase 5, #39) -- the global counterpart to #38's
 * `getProjectIncidentsPage`, same keyset pagination on `started_at`
 * (served by the dedicated `incidents_started_at_idx` added alongside this
 * query, since there's no `project_id` predicate to make the per-project
 * composite index useful here) plus optional project/status/time-range
 * filters applied as real SQL predicates -- not in-memory like the
 * overview page's client-side table filtering, since unlike that already
 * fully-fetched, bounded (~50 project) list, this dataset can grow
 * unboundedly and is itself paginated.
 *
 * Uses every one of the user's projects (`getProjects`, not
 * `getActiveProjects`) as the project-filter's own option set at the call
 * site -- a paused project's *past* incidents are still real history, and
 * the issue's own acceptance criterion says "every project the signed-in
 * user owns," not "every active project" (a deliberate difference from the
 * overview page's #29 scope, flagged here rather than assumed).
 *
 * Relies entirely on `incidents_select_own` RLS for scoping -- no
 * `project_id` filter of its own means this can safely omit any manual
 * ownership check and still only ever return the caller's own incidents.
 */
export async function getIncidentsPage(
  filters: GlobalIncidentFilters,
  cursor?: IncidentCursor,
): Promise<{ data: GlobalIncidentPage | null; error: string | null }> {
  const supabase = await createClient();
  const since = filters.since
    ? new Date(Date.now() - INCIDENT_TIME_RANGE_HOURS[filters.since] * 60 * 60 * 1000).toISOString()
    : null;

  let pageQuery = supabase.from("incidents").select(GLOBAL_INCIDENT_COLUMNS);
  if (filters.projectId) {
    pageQuery = pageQuery.eq("project_id", filters.projectId);
  }
  if (filters.status === "open") {
    pageQuery = pageQuery.is("resolved_at", null);
  } else if (filters.status === "resolved") {
    pageQuery = pageQuery.not("resolved_at", "is", null);
  }
  if (since) {
    pageQuery = pageQuery.gte("started_at", since);
  }

  if (cursor?.direction === "next") {
    pageQuery = pageQuery.lt("started_at", cursor.startedAt).order("started_at", {
      ascending: false,
    });
  } else if (cursor?.direction === "previous") {
    pageQuery = pageQuery.gt("started_at", cursor.startedAt).order("started_at", {
      ascending: true,
    });
  } else {
    pageQuery = pageQuery.order("started_at", { ascending: false });
  }

  const { data, error } = await pageQuery.limit(INCIDENT_PAGE_SIZE);

  if (error) {
    return { data: null, error: error.message };
  }

  const rawRows = (
    cursor?.direction === "previous" ? [...data].reverse() : data
  ) as unknown as RawGlobalIncidentRow[];
  const rows: GlobalIncidentRow[] = rawRows.map(({ projects, ...incident }) => ({
    ...incident,
    project_name: projects?.name ?? "Unknown project",
  }));

  if (rows.length === 0) {
    return { data: { rows: [], hasNext: false, hasPrevious: false }, error: null };
  }

  const globalNewest = rows[0].started_at;
  const globalOldest = rows[rows.length - 1].started_at;

  let olderQuery = supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .lt("started_at", globalOldest);
  let newerQuery = supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .gt("started_at", globalNewest);

  if (filters.projectId) {
    olderQuery = olderQuery.eq("project_id", filters.projectId);
    newerQuery = newerQuery.eq("project_id", filters.projectId);
  }
  if (filters.status === "open") {
    olderQuery = olderQuery.is("resolved_at", null);
    newerQuery = newerQuery.is("resolved_at", null);
  } else if (filters.status === "resolved") {
    olderQuery = olderQuery.not("resolved_at", "is", null);
    newerQuery = newerQuery.not("resolved_at", "is", null);
  }
  if (since) {
    olderQuery = olderQuery.gte("started_at", since);
    newerQuery = newerQuery.gte("started_at", since);
  }

  const [{ count: globalOlderCount, error: globalOlderError }, { count: globalNewerCount, error: globalNewerError }] =
    await Promise.all([olderQuery, newerQuery]);

  if (globalOlderError || globalNewerError) {
    return { data: null, error: (globalOlderError ?? globalNewerError)!.message };
  }

  return {
    data: {
      rows,
      hasNext: (globalOlderCount ?? 0) > 0,
      hasPrevious: (globalNewerCount ?? 0) > 0,
    },
    error: null,
  };
}
