"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Search, Trash2, X } from "lucide-react";
import { useTable, type ColumnFiltersState, type ColumnVisibilityState, type SortingState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { dataTableFeatures } from "@/components/data-table/features";
import { createProjectColumns } from "./project-columns";
import { getAvailableHostingProviders, getAvailableTags } from "../lib/filters";
import type { ManualCheckResult, Project } from "../types";

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
];

type ProjectTableProps = {
  projects: Project[];
  existingCollections: string[];
  pendingId: string | null;
  runningId: string | null;
  runResults: Record<string, ManualCheckResult>;
  runErrors: Record<string, string>;
  onRunCheckNow: (project: Project) => void;
  onToggleActive: (project: Project) => void;
  onEditSuccess: (updated: Project) => void;
  onRequestDelete: (projects: Project[]) => void;
  onBulkSetActive: (projects: Project[], isActive: boolean) => void;
  bulkPending?: boolean;
};

/**
 * Table view for the projects list (the other half of the card/table
 * toggle -- see project-list.tsx). Owns its own TanStack Table v9 instance
 * (sorting/column-visibility/pagination/row-selection are display concerns
 * local to this view), while every actual mutation (run check, toggle
 * active, edit, delete) is delegated back up to `ProjectList` via props --
 * so both views share exactly one copy of that logic/state, never two
 * independently-maintained copies.
 */
export function ProjectTable({
  projects,
  existingCollections,
  pendingId,
  runningId,
  runResults,
  runErrors,
  onRunCheckNow,
  onToggleActive,
  onEditSuccess,
  onRequestDelete,
  onBulkSetActive,
  bulkPending = false,
}: ProjectTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [providerFilter, setProviderFilter] = useState<string[]>([]);
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);

  const columns = useMemo(
    () =>
      createProjectColumns({
        existingCollections,
        pendingId,
        runningId,
        runResults,
        runErrors,
        onRunCheckNow,
        onToggleActive,
        onEditSuccess,
        onRequestDelete,
      }),
    [
      existingCollections,
      pendingId,
      runningId,
      runResults,
      runErrors,
      onRunCheckNow,
      onToggleActive,
      onEditSuccess,
      onRequestDelete,
    ],
  );

  const providerOptions = useMemo(
    () => getAvailableHostingProviders(projects).map((value) => ({ label: value, value })),
    [projects],
  );
  const tagOptions = useMemo(
    () => getAvailableTags(projects).map((value) => ({ label: value, value })),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    return projects.filter((project) => {
      if (query && !project.name.toLowerCase().includes(query)) return false;
      if (statusFilter.length > 0) {
        const status = project.is_active ? "active" : "paused";
        if (!statusFilter.includes(status)) return false;
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
  }, [projects, nameFilter, statusFilter, providerFilter, tagsFilter]);

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
    data: filteredProjects,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  });

  const selectedProjects = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
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
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
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
        </div>
        {selectedProjects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedProjects.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkPending}
              onClick={() => {
                onBulkSetActive(selectedProjects, true);
                table.resetRowSelection();
              }}
            >
              <Play />
              Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkPending}
              onClick={() => {
                onBulkSetActive(selectedProjects, false);
                table.resetRowSelection();
              }}
            >
              <Pause />
              Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkPending}
              onClick={() => onRequestDelete(selectedProjects)}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        )}
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="No projects match your filters." />
    </div>
  );
}
