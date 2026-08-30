"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useTable, type ColumnFiltersState, type ColumnVisibilityState, type SortingState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { dataTableFeatures } from "@/components/data-table/features";
import type { Project, CheckStatus } from "@/features/projects";
import { STATUS_META } from "../constants";
import { getAvailableProviders, getAvailableTags } from "../lib/filters";
import { createOverviewColumns, type OverviewRow } from "./overview-columns";
import type { ProjectUptimeSummary } from "../types";

const STATUS_OPTIONS: CheckStatus[] = ["up", "degraded", "waking", "down", "unknown"];

/**
 * Dashboard overview table (PRD §5.6, Phase 4, issue #29 and #33): every
 * active project owned by the signed-in user, its current status,
 * last-checked time, and rolling uptime % for each window -- same TanStack
 * Table v9 shell (search box, filter dropdowns, sortable columns, paginated
 * footer) as `ProjectTable`/`ApiKeyTable`, minus row-selection/bulk actions
 * (there's nothing to bulk-mutate here -- this table is a read-only status
 * snapshot).
 *
 * Filtering/search/sorting/pagination all live in local client state, not
 * the URL -- consistent with the projects/API-keys tables, and simpler than
 * this page's previous URL-driven filter chips now that the whole active-
 * project list (PRD-capped at ~50) is already fetched up front.
 */
export function OverviewTable({
  projects,
  summaries,
}: {
  projects: Project[];
  summaries: ProjectUptimeSummary[];
}) {
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [providerFilter, setProviderFilter] = useState<string[]>([]);
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);

  const columns = useMemo(() => createOverviewColumns(), []);

  const statusOptions = useMemo(
    () => STATUS_OPTIONS.map((status) => ({ label: STATUS_META[status].label, value: status })),
    [],
  );
  const providerOptions = useMemo(
    () => getAvailableProviders(projects).map((value) => ({ label: value, value })),
    [projects],
  );
  const tagOptions = useMemo(
    () => getAvailableTags(projects).map((value) => ({ label: value, value })),
    [projects],
  );

  const rows = useMemo<OverviewRow[]>(() => {
    const summaryByProjectId = new Map(summaries.map((s) => [s.project_id, s]));
    return projects.map((project) => ({ project, summary: summaryByProjectId.get(project.id) }));
  }, [projects, summaries]);

  const filteredRows = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    return rows.filter(({ project, summary }) => {
      if (query && !project.name.toLowerCase().includes(query)) return false;
      if (statusFilter.length > 0) {
        const status = summary?.last_status ?? null;
        if (!status || !statusFilter.includes(status)) return false;
      }
      if (providerFilter.length > 0) {
        if (!project.hosting_provider || !providerFilter.includes(project.hosting_provider)) {
          return false;
        }
      }
      if (tagsFilter.length > 0) {
        const tags = project.tags ?? [];
        if (!tagsFilter.some((tag) => tags.includes(tag))) return false;
      }
      return true;
    });
  }, [rows, nameFilter, statusFilter, providerFilter, tagsFilter]);

  const hasActiveFilters =
    nameFilter.trim().length > 0 ||
    statusFilter.length > 0 ||
    providerFilter.length > 0 ||
    tagsFilter.length > 0;

  function clearFilters() {
    setNameFilter("");
    setStatusFilter([]);
    setProviderFilter([]);
    setTagsFilter([]);
  }

  const table = useTable({
    features: dataTableFeatures,
    data: filteredRows,
    columns,
    state: { sorting, columnVisibility, columnFilters, pagination },
    getRowId: (row) => row.project.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <DataTableFilter
          title="Status"
          options={statusOptions}
          selected={statusFilter}
          onChange={setStatusFilter}
          multiple
        />
        <DataTableFilter
          title="Hosting provider"
          options={providerOptions}
          selected={providerFilter}
          onChange={setProviderFilter}
        />
        <DataTableFilter
          title="Tags"
          options={tagOptions}
          selected={tagsFilter}
          onChange={setTagsFilter}
          multiple
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear filters
          </Button>
        )}
        <DataTableViewOptions table={table} />
      </div>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="No projects match your filters."
        showSelectionCount={false}
      />
    </div>
  );
}
