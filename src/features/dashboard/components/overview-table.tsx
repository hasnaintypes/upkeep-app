import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/features/projects";
import { StatusBadge } from "./status-badge";
import { UPTIME_WINDOWS } from "../constants";
import type { ProjectUptimeSummary, UptimeWindowKey } from "../types";

/** Column-priority breakpoints for the uptime-window columns on narrow
 * viewports: 24h (the window users care about first) stays visible at
 * every width, 7d joins at `sm`, 30d/90d join at `md` -- so a 375px phone
 * shows Status/Project/24h without needing horizontal scroll, rather than
 * cramming all 7 columns and relying solely on the table's built-in
 * `overflow-x-auto` (mobile-responsive pass, issue #34). */
const UPTIME_COLUMN_VISIBILITY: Record<UptimeWindowKey, string> = {
  "24h": "",
  "7d": "hidden sm:table-cell",
  "30d": "hidden md:table-cell",
  "90d": "hidden md:table-cell",
};

/** Renders one uptime-window cell, "—" for a window with no data yet
 * (brand-new project, or a window entirely older than its first check). */
function UptimeCell({ value, className }: { value: number | null; className?: string }) {
  return (
    <TableCell className={cn("text-right tabular-nums text-muted-foreground", className)}>
      {value === null ? "—" : `${value}%`}
    </TableCell>
  );
}

/**
 * Dashboard overview table (PRD §5.6, Phase 4, issue #29): every active
 * project owned by the signed-in user, its current status, last-checked
 * time, and rolling uptime % for each window in `UPTIME_WINDOWS`.
 *
 * A plain Server Component -- no client state needed, `formatRelativeTime`
 * is computed once at render time. `summaries` is looked up by
 * `project_id` in a Map rather than re-querying per row (both come from a
 * single parent fetch -- see src/app/dashboard/page.tsx).
 */
export function OverviewTable({
  projects,
  summaries,
}: {
  projects: Project[];
  summaries: ProjectUptimeSummary[];
}) {
  const summaryByProjectId = new Map(summaries.map((s) => [s.project_id, s]));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Project</TableHead>
          <TableHead className="hidden sm:table-cell">Last checked</TableHead>
          {UPTIME_WINDOWS.map((window) => (
            <TableHead
              key={window.key}
              className={cn("text-right", UPTIME_COLUMN_VISIBILITY[window.key])}
            >
              {window.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => {
          const summary = summaryByProjectId.get(project.id);

          return (
            <TableRow key={project.id}>
              <TableCell>
                <StatusBadge status={summary?.last_status ?? null} />
              </TableCell>
              <TableCell className="max-w-64">
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {project.health_url}
                </p>
              </TableCell>
              <TableCell
                className="hidden text-muted-foreground sm:table-cell"
                title={
                  summary?.last_checked_at
                    ? new Date(summary.last_checked_at).toLocaleString()
                    : undefined
                }
              >
                {summary?.last_checked_at
                  ? formatRelativeTime(summary.last_checked_at)
                  : "Never"}
              </TableCell>
              <UptimeCell value={summary?.uptime_24h ?? null} className={UPTIME_COLUMN_VISIBILITY["24h"]} />
              <UptimeCell value={summary?.uptime_7d ?? null} className={UPTIME_COLUMN_VISIBILITY["7d"]} />
              <UptimeCell value={summary?.uptime_30d ?? null} className={UPTIME_COLUMN_VISIBILITY["30d"]} />
              <UptimeCell value={summary?.uptime_90d ?? null} className={UPTIME_COLUMN_VISIBILITY["90d"]} />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
