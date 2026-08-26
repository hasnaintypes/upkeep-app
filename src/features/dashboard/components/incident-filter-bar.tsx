import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Project } from "@/features/projects";
import { INCIDENT_TIME_RANGE_OPTIONS } from "../constants";
import { hasActiveIncidentFilters } from "../lib/incident-filters";
import type { GlobalIncidentFilters } from "../types";
import { IncidentFilterSelect } from "./incident-filter-select";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

/**
 * Filter bar for the global incident view (PRD §5.4, Phase 5, #39):
 * project, status (open/resolved), and time-range, each a single-select
 * (see `IncidentFilterSelect`'s own doc comment for why these use `Select`
 * instead of the overview page's toggle chips, #33). Filter state lives
 * entirely in the URL (`parseGlobalIncidentFilters`/`incidentFilterHref` in
 * lib/incident-filters.ts) -- same convention as `OverviewFilterBar`.
 */
export function IncidentFilterBar({
  filters,
  projects,
  pathname,
}: {
  filters: GlobalIncidentFilters;
  projects: Project[];
  pathname: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IncidentFilterSelect
        label="Filter by project"
        placeholder="All projects"
        value={filters.projectId}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        pathname={pathname}
        filters={filters}
        filterKey="projectId"
      />
      <IncidentFilterSelect
        label="Filter by status"
        placeholder="All statuses"
        value={filters.status}
        options={STATUS_OPTIONS}
        pathname={pathname}
        filters={filters}
        filterKey="status"
      />
      <IncidentFilterSelect
        label="Filter by time range"
        placeholder="All time"
        value={filters.since}
        options={INCIDENT_TIME_RANGE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
        pathname={pathname}
        filters={filters}
        filterKey="since"
      />
      {hasActiveIncidentFilters(filters) && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={pathname}>Clear filters</Link>
        </Button>
      )}
    </div>
  );
}
