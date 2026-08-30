"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTable, type ColumnFiltersState, type ColumnVisibilityState, type SortingState } from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { dataTableFeatures } from "@/components/data-table/features";
import { createApiKeyColumns } from "./api-key-columns";
import type { ApiKey } from "../types";

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Revoked", value: "revoked" },
];

type ApiKeyTableProps = {
  keys: ApiKey[];
  pendingId: string | null;
  onRequestRevoke: (key: ApiKey) => void;
};

/**
 * Table view for the API keys list -- same TanStack Table v9 shell as
 * `project-table.tsx`, minus row selection/bulk actions: there's no bulk
 * operation on this page (revoking is a deliberate, one-at-a-time action),
 * so there's no `rowSelection` state, no `select` column, and no bulk
 * toolbar to render.
 */
export function ApiKeyTable({ keys, pendingId, onRequestRevoke }: ApiKeyTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [labelFilter, setLabelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const columns = useMemo(
    () => createApiKeyColumns({ pendingId, onRequestRevoke }),
    [pendingId, onRequestRevoke],
  );

  const filteredKeys = useMemo(() => {
    const query = labelFilter.trim().toLowerCase();
    return keys.filter((key) => {
      if (query && !key.label.toLowerCase().includes(query)) return false;
      if (statusFilter.length > 0) {
        const status = key.revoked_at ? "revoked" : "active";
        if (!statusFilter.includes(status)) return false;
      }
      return true;
    });
  }, [keys, labelFilter, statusFilter]);

  const table = useTable({
    features: dataTableFeatures,
    data: filteredKeys,
    columns,
    state: { sorting, columnVisibility, columnFilters, pagination },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search keys..."
            value={labelFilter}
            onChange={(event) => setLabelFilter(event.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <DataTableFilter
          title="Status"
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
      </div>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="No API keys match your filters."
        showSelectionCount={false}
      />
    </div>
  );
}
