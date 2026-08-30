"use client";

import Link from "next/link";

import { createDataTableColumnHelper } from "@/components/data-table/features";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/features/projects";
import { StatusBadge } from "./status-badge";
import type { ProjectUptimeSummary, UptimeWindowKey } from "../types";

/** One overview row -- a project plus its uptime summary (looked up by
 * `project_id`, see `OverviewTable`), merged once here rather than kept as
 * two parallel arrays so every column can be a plain accessor/cell against
 * a single flat shape. */
export type OverviewRow = {
  project: Project;
  summary: ProjectUptimeSummary | undefined;
};

/** Column-priority breakpoints for the uptime-window columns on narrow
 * viewports: 24h (the window users care about first) stays visible at
 * every width, 7d joins at `sm`, 30d/90d join at `md` -- so a 375px phone
 * shows Status/Project/24h without needing horizontal scroll, rather than
 * cramming all 7 columns and relying solely on the table's built-in
 * `overflow-x-auto` (mobile-responsive pass, issue #34). Applied via each
 * column's `meta.headerClassName`/`cellClassName` -- see `DataTable`. */
const UPTIME_COLUMN_VISIBILITY: Record<UptimeWindowKey, string> = {
  "24h": "",
  "7d": "hidden sm:table-cell",
  "30d": "hidden md:table-cell",
  "90d": "hidden md:table-cell",
};

const UPTIME_WINDOWS: { key: UptimeWindowKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

const columnHelper = createDataTableColumnHelper<OverviewRow>();

/**
 * Column definitions for the dashboard overview table (PRD §5.6, Phase 4,
 * issue #29) -- same TanStack Table v9 shell as Projects/API keys, but
 * read-only: there's no per-row mutation here (no edit/pause/delete), just
 * a status/uptime snapshot linking through to each project's own detail
 * page, so this factory takes no handlers.
 */
export function createOverviewColumns() {
  return columnHelper.columns([
    columnHelper.display({
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      // Composite cell: status badge + rolling 24h uptime together, not two
      // separate always-visible columns -- severity (down/degraded + how
      // bad) reads as one unit instead of requiring a glance across the row,
      // and frees a column's worth of width on narrow viewports.
      cell: ({ row }) => {
        const uptime24h = row.original.summary?.uptime_24h;
        return (
          <div className="flex items-center gap-2">
            <StatusBadge status={row.original.summary?.last_status ?? null} />
            <span className="text-xs text-muted-foreground tabular-nums">
              {uptime24h === undefined || uptime24h === null ? "—" : `${uptime24h}% (24h)`}
            </span>
          </div>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor((row) => row.project.name, {
      id: "project",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
      cell: ({ row }) => (
        <div className="max-w-64">
          <Link
            href={`/dashboard/projects/${row.original.project.id}`}
            className="font-medium hover:underline"
          >
            {row.original.project.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.project.health_url}
          </p>
        </div>
      ),
      enableHiding: false,
    }),
    columnHelper.accessor((row) => row.summary?.last_checked_at ?? undefined, {
      id: "lastChecked",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last checked" />,
      cell: ({ row }) => {
        const lastCheckedAt = row.original.summary?.last_checked_at;
        return (
          <span
            className="text-muted-foreground"
            title={lastCheckedAt ? formatDateTime(lastCheckedAt) : undefined}
          >
            {lastCheckedAt ? formatRelativeTime(lastCheckedAt) : "Never"}
          </span>
        );
      },
      sortUndefined: "last",
      meta: {
        headerClassName: "hidden sm:table-cell",
        cellClassName: "hidden sm:table-cell",
        label: "Last checked",
      },
    }),
    // 24h is already shown in the composite status cell above -- only 7d/30d/90d
    // get their own column here.
    ...UPTIME_WINDOWS.filter(({ key }) => key !== "24h").map(({ key, label }) =>
      columnHelper.accessor((row) => row.summary?.[`uptime_${key}`] ?? undefined, {
        id: `uptime_${key}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={label} className="justify-end" />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <span className="block text-right tabular-nums text-muted-foreground">
              {value === undefined ? "—" : `${value}%`}
            </span>
          );
        },
        sortUndefined: "last",
        meta: {
          headerClassName: `text-right ${UPTIME_COLUMN_VISIBILITY[key]}`,
          cellClassName: UPTIME_COLUMN_VISIBILITY[key],
          label: `${label} uptime`,
        },
      }),
    ),
  ]);
}
