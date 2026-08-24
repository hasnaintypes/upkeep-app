import type {
  GlobalIncidentFilters,
  GlobalIncidentSearchParams,
  IncidentStatusFilter,
  IncidentTimeRangeKey,
} from "../types";

const VALID_STATUSES: ReadonlySet<string> = new Set(["open", "resolved"]);
const VALID_TIME_RANGES: ReadonlySet<string> = new Set(["24h", "7d", "30d", "90d"]);

/**
 * Global incident view filter state (PRD §5.4, Phase 5, #39), parsed from
 * URL query params -- same "the URL is the only source of truth, no
 * client-side filter state that isn't also reflected there" convention as
 * the overview page's `parseOverviewFilters` (#33), so a filtered/paginated
 * view stays shareable/bookmarkable/refresh-safe.
 */
export function parseGlobalIncidentFilters(
  searchParams: GlobalIncidentSearchParams,
): GlobalIncidentFilters {
  const status = searchParams.status;
  const since = searchParams.since;

  return {
    projectId: searchParams.project?.trim() || null,
    status: status && VALID_STATUSES.has(status) ? (status as IncidentStatusFilter) : null,
    since: since && VALID_TIME_RANGES.has(since) ? (since as IncidentTimeRangeKey) : null,
  };
}

export function hasActiveIncidentFilters(filters: GlobalIncidentFilters): boolean {
  return filters.projectId !== null || filters.status !== null || filters.since !== null;
}

/**
 * Href for one filter select's new value -- preserves every other active
 * filter but deliberately drops any pagination cursor (`cursor`/`dir`): a
 * cursor computed against one filter combination doesn't mean anything
 * once the underlying filtered result set changes, so changing a filter
 * always resets back to page one. Passing `value: null` clears that facet
 * (the select's own "All ..." option).
 */
export function incidentFilterHref(
  pathname: string,
  current: GlobalIncidentFilters,
  key: "projectId" | "status" | "since",
  value: string | null,
): string {
  const next: GlobalIncidentFilters = { ...current, [key]: value };

  const params = new URLSearchParams();
  if (next.projectId) params.set("project", next.projectId);
  if (next.status) params.set("status", next.status);
  if (next.since) params.set("since", next.since);

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
