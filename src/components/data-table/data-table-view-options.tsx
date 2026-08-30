"use client";

import { ChevronDown, Columns3 } from "lucide-react";
import type { RowData, Table as TanstackTable } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataTableFeatures } from "./features";

/** "Customize columns" dropdown -- toggles visibility for every hideable,
 * accessor-backed column (display columns like `select`/`actions` opt out
 * via `enableHiding: false` on their own column def, matching the
 * reference shadcn block's `typeof column.accessorFn !== "undefined"`
 * check). */
export function DataTableViewOptions<TData extends RowData>({
  table,
}: {
  table: TanstackTable<DataTableFeatures, TData>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          <span className="hidden lg:inline">Customize columns</span>
          <span className="lg:hidden">Columns</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {table
          .getAllColumns()
          .filter(
            (column) => typeof column.accessorFn !== "undefined" && column.getCanHide(),
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className={column.columnDef.meta?.label ? undefined : "capitalize"}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              onSelect={(event) => event.preventDefault()}
            >
              {column.columnDef.meta?.label ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
