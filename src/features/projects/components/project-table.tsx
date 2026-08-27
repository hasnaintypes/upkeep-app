"use client";

import { useMemo, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { useTable, type ColumnFiltersState, type ColumnVisibilityState, type SortingState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { dataTableFeatures } from "@/components/data-table/features";
import { createProjectColumns } from "./project-columns";
import type { ManualCheckResult, Project } from "../types";

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

  const filteredProjects = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, nameFilter]);

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
        <Input
          placeholder="Filter by name..."
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          className="h-8 w-full max-w-64"
        />
        <div className="flex items-center gap-2">
          {selectedProjects.length > 0 && (
            <>
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
            </>
          )}
          <DataTableViewOptions table={table} />
        </div>
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="No projects match your filters." />
    </div>
  );
}
