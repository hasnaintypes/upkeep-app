"use client";

import { FlexRender, type RowData, type Table as TanstackTable } from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "./features";
import { DataTablePagination } from "./data-table-pagination";

/**
 * Generic, reusable data table shell (header/body/empty-state/pagination)
 * built on TanStack Table v9 -- the "engine" every feature-specific table
 * in this app should render through instead of hand-rolling its own
 * `<table>` markup (see `src/features/projects/components/project-table.tsx`
 * for the first consumer). The caller owns the actual `useTable(...)`
 * instance (column defs, data, and per-table state like sorting/row
 * selection are all table-specific) -- this component's only job is
 * rendering whatever that instance currently reports, plus the shared
 * pagination footer.
 *
 * `columnCount` is needed separately from the table instance purely for
 * the empty-state row's `colSpan` -- `table.getAllLeafColumns().length`
 * would work too, but a plain prop keeps this component from having an
 * opinion about which columns should count (e.g. hidden ones).
 */
export function DataTable<TData extends RowData>({
  table,
  columnCount,
  emptyMessage = "No results.",
  hidePagination = false,
  showSelectionCount = true,
}: {
  table: TanstackTable<DataTableFeatures, TData>;
  columnCount: number;
  emptyMessage?: string;
  hidePagination?: boolean;
  /** Forwarded to `DataTablePagination` -- see its own doc comment. */
  showSelectionCount?: boolean;
}) {
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(header.column.columnDef.meta?.headerClassName)}
                  >
                    {header.isPlaceholder ? null : <FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(cell.column.columnDef.meta?.cellClassName)}
                    >
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && (
        <DataTablePagination table={table} showSelectionCount={showSelectionCount} />
      )}
    </div>
  );
}
