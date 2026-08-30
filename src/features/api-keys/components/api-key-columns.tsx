"use client";

import { Ban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatDateTime } from "@/lib/utils";
import type { ApiKey } from "../types";

function formatTimestamp(value: string | null): string {
  return value ? formatDateTime(value) : "Never";
}

const columnHelper = createDataTableColumnHelper<ApiKey>();

export type ApiKeyColumnHandlers = {
  pendingId: string | null;
  onRequestRevoke: (key: ApiKey) => void;
};

/**
 * Column definitions for the API keys table view -- same factory pattern as
 * `project-columns.tsx`'s `createProjectColumns` (per-row handlers/live
 * pending state only exist once `ApiKeyList` is rendering), but with no
 * `select` column: this page has no bulk actions, so there's nothing for
 * row-selection checkboxes to drive.
 */
export function createApiKeyColumns(handlers: ApiKeyColumnHandlers) {
  const { pendingId, onRequestRevoke } = handlers;

  return columnHelper.columns([
    columnHelper.accessor("label", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Label" />,
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
      enableHiding: false,
    }),
    columnHelper.accessor("key_prefix", {
      header: "Key",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.key_prefix}...
        </span>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => {
        const isRevoked = !!row.original.revoked_at;
        return (
          <Badge variant={isRevoked ? "outline" : "secondary"}>
            {isRevoked ? "Revoked" : "Active"}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("created_at", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatTimestamp(row.original.created_at)}</span>
      ),
    }),
    columnHelper.accessor("last_used_at", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last used" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatTimestamp(row.original.last_used_at)}</span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const key = row.original;
        const isRevoked = !!key.revoked_at;
        if (isRevoked) return null;
        return (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Revoke key"
            disabled={pendingId === key.id}
            onClick={() => onRequestRevoke(key)}
          >
            <Ban className="size-4" />
          </Button>
        );
      },
      enableSorting: false,
      enableHiding: false,
    }),
  ]);
}
