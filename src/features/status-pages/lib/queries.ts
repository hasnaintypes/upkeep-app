import type { CheckStatus } from "@/features/projects";
import type { DailyHistoryPoint, ResponseTimeSeries } from "@/features/dashboard";
import { createClient } from "@/lib/supabase/server";
import type { PublicProjectStatus, PublicProjectSummary } from "../types";

/**
 * Status + rolling uptime % for one opted-in-public project (PRD §5.6,
 * Phase 8, #51). Unauthenticated-safe: `get_public_project_status` is a
 * `security definer` function that re-checks `is_public` itself and returns
 * only safe columns (see the migration's own comment) -- this works
 * whether or not the caller has a session, unlike every other query in
 * `features/dashboard/lib/queries.ts`, which relies on RLS/`auth.uid()`.
 *
 * Returns `{ data: null, error: null }` for a private or nonexistent
 * project id (the function itself returns zero rows in both cases,
 * indistinguishable from each other) -- the route layer turns this into a
 * plain 404, never a 403 that would confirm a private project exists.
 */
export async function getPublicProjectStatus(projectId: string): Promise<{
  data: PublicProjectStatus | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_project_status", {
    p_project_id: projectId,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  const row = data?.[0];
  if (!row) {
    return { data: null, error: null };
  }

  return {
    data: { ...row, last_status: row.last_status as CheckStatus | null },
    error: null,
  };
}

/**
 * Every currently-public project's status + 24h/7d/30d/90d uptime %, for the
 * aggregate portfolio status page (PRD §5.6, Phase 8, #53). Same
 * unauthenticated-safe reasoning as `getPublicProjectStatus` above --
 * `get_public_projects_summary` is a `security definer` function that
 * filters to `is_public = true` itself. Unlike the single-project queries,
 * an empty result here is a normal, valid state (no public projects yet),
 * not treated as an error or a 404 by the route layer.
 */
export async function getPublicProjectsSummary(): Promise<{
  data: PublicProjectSummary[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_projects_summary");

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((row) => ({
      ...row,
      last_status: row.last_status as CheckStatus | null,
    })),
    error: null,
  };
}

/** Matches the authenticated heatmap's own default (#31) -- same visual
 * component, same lookback window. */
const HEATMAP_DAYS = 90;

/**
 * Per-day uptime history for the public status page's heatmap (#51),
 * reusing `UptimeHeatmap` from `features/dashboard`. Same
 * unauthenticated-safe/zero-rows-means-private-or-missing reasoning as
 * `getPublicProjectStatus` above.
 */
export async function getPublicProjectDailyHistory(projectId: string): Promise<{
  data: DailyHistoryPoint[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_project_daily_history", {
    p_project_id: projectId,
    p_days: HEATMAP_DAYS,
  });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data ?? []) as unknown as DailyHistoryPoint[], error: null };
}

/**
 * Recent (default 24h) raw checks for the public status page's response-
 * time chart (#51), reshaped into the same `ResponseTimeSeries` ("raw")
 * shape `ResponseTimeChart` (`features/dashboard`) already renders --
 * intentionally a single fixed window, not the authenticated dashboard's
 * full 24h/7d/30d/90d switcher (#30), per this issue's narrower "recent
 * history" scope. Same failed-point detection as
 * `getResponseTimeSeries` (dashboard/lib/queries.ts): a network/DNS error
 * or a down check with no http_status at all isn't a meaningful latency
 * value, so it's marked `failed` instead of plotted as a number.
 */
export async function getPublicProjectResponseTime(projectId: string): Promise<{
  data: ResponseTimeSeries | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_project_recent_checks", {
    p_project_id: projectId,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      kind: "raw",
      points: (data ?? []).map((row) => {
        const status = row.status as CheckStatus;
        const failed = status === "unknown" || (status === "down" && row.http_status === null);

        return {
          checkedAt: row.checked_at,
          responseTimeMs: failed ? null : row.response_time_ms,
          failed,
          status,
        };
      }),
    },
    error: null,
  };
}
