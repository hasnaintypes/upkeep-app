import type { CheckStatus, Project } from "@/features/projects";
import type { ProjectUptimeSummary } from "../types";

/**
 * Overview page filter state (PRD §5.6, Phase 4, #33), parsed from URL
 * query params so a filtered view is shareable/bookmarkable and survives a
 * refresh (per the issue's acceptance criteria) -- there is no client-side
 * filter state that isn't also reflected in the URL.
 */
export type OverviewFilters = {
  q: string;
  tags: string[];
  providers: string[];
  statuses: CheckStatus[];
};

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "up",
  "down",
  "degraded",
  "waking",
  "unknown",
]);

/** Comma-separated single query params (`?tags=api,backend`), not repeated
 * keys (`?tags=api&tags=backend`) -- simpler to parse/type (always
 * `string | undefined`, never `string | string[] | undefined`) and just as
 * shareable/bookmarkable. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

export type OverviewSearchParams = {
  q?: string;
  tags?: string;
  providers?: string;
  statuses?: string;
};

export function parseOverviewFilters(searchParams: OverviewSearchParams): OverviewFilters {
  return {
    q: searchParams.q?.trim() ?? "",
    tags: parseList(searchParams.tags),
    providers: parseList(searchParams.providers),
    statuses: parseList(searchParams.statuses).filter((s): s is CheckStatus =>
      VALID_STATUSES.has(s),
    ),
  };
}

export function hasActiveFilters(filters: OverviewFilters): boolean {
  return (
    filters.q.length > 0 ||
    filters.tags.length > 0 ||
    filters.providers.length > 0 ||
    filters.statuses.length > 0
  );
}

/** Distinct tags across the given projects, sorted -- derived from the
 * signed-in user's actual data (not a hardcoded list), per the issue's
 * acceptance criteria. Computed from the *unfiltered* project list so a
 * facet's own available options don't shrink as other filters are
 * applied. */
export function getAvailableTags(projects: Project[]): string[] {
  return Array.from(new Set(projects.flatMap((p) => p.tags ?? []))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Distinct hosting providers across the given projects, sorted -- same
 * "derived from real data, computed pre-filter" reasoning as
 * `getAvailableTags`. */
export function getAvailableProviders(projects: Project[]): string[] {
  return Array.from(
    new Set(projects.map((p) => p.hosting_provider).filter((p): p is string => !!p?.trim())),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Applies every active filter to `projects` with AND semantics *across*
 * facets (search AND tags AND providers AND statuses), and OR semantics
 * *within* a multi-select facet (selecting two tags matches a project with
 * either one) -- the standard faceted-search convention, and the
 * interpretation of "multi-select" the issue's acceptance criteria implies
 * without spelling out explicitly.
 */
export function filterOverviewRows(
  projects: Project[],
  summaryByProjectId: Map<string, ProjectUptimeSummary>,
  filters: OverviewFilters,
): Project[] {
  const q = filters.q.toLowerCase();

  return projects.filter((project) => {
    if (q && !project.name.toLowerCase().includes(q)) {
      return false;
    }

    if (filters.tags.length > 0) {
      const projectTags = project.tags ?? [];
      if (!filters.tags.some((tag) => projectTags.includes(tag))) {
        return false;
      }
    }

    if (filters.providers.length > 0) {
      if (!project.hosting_provider || !filters.providers.includes(project.hosting_provider)) {
        return false;
      }
    }

    if (filters.statuses.length > 0) {
      const status = summaryByProjectId.get(project.id)?.last_status ?? null;
      if (!status || !filters.statuses.includes(status)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Href for toggling one value of one facet in/out of the current filter
 * state, preserving every other active filter -- backs the tag/provider/
 * status chips, which are plain `<Link>`s (no client JS needed to filter by
 * them; only the free-text search box needs to be a Client Component, for
 * debounced typing).
 */
export function toggleFilterHref(
  pathname: string,
  current: OverviewFilters,
  key: "tags" | "providers" | "statuses",
  value: string,
): string {
  const currentValues = current[key] as string[];
  const nextValues = currentValues.includes(value)
    ? currentValues.filter((v) => v !== value)
    : [...currentValues, value];

  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  for (const facet of ["tags", "providers", "statuses"] as const) {
    const values = facet === key ? nextValues : (current[facet] as string[]);
    if (values.length > 0) params.set(facet, values.join(","));
  }

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
