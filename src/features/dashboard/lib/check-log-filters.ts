import type { CheckStatus } from "@/features/projects";
import type { CheckLogFilters, CheckLogSearchParams } from "../types";

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "up",
  "down",
  "degraded",
  "waking",
  "unknown",
]);

/** Parses the per-project detail page's `status`/`q` query params into check
 * log filter state -- same "URL is the only source of truth" approach as
 * `parseGlobalIncidentFilters` (lib/incident-filters.ts), for the same
 * reason: this table is server-paginated, so filters have to be real query
 * params. */
export function parseCheckLogFilters(searchParams: CheckLogSearchParams): CheckLogFilters {
  const status = searchParams.status;
  return {
    status: status && VALID_STATUSES.has(status) ? (status as CheckStatus) : null,
    q: searchParams.q?.trim() || null,
  };
}

export function hasActiveCheckLogFilters(filters: CheckLogFilters): boolean {
  return filters.status !== null || filters.q !== null;
}

/**
 * Href for a new check-log filter value -- preserves the Incidents tab's own
 * `incidentCursor`/`incidentDir` (unrelated pagination living on this same
 * page) but always drops the check log's own `cursor`/`dir`: a cursor
 * computed against one filter/search combination doesn't mean anything once
 * the filtered result set changes, same reasoning as `incidentFilterHref`.
 */
export function checkLogFilterHref(
  pathname: string,
  current: CheckLogFilters,
  key: "status" | "q",
  value: string | null,
  preserve: { incidentCursor?: string; incidentDir?: string },
): string {
  const next: CheckLogFilters = { ...current, [key]: value };

  const params = new URLSearchParams();
  if (next.status) params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (preserve.incidentCursor) params.set("incidentCursor", preserve.incidentCursor);
  if (preserve.incidentDir) params.set("incidentDir", preserve.incidentDir);

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
