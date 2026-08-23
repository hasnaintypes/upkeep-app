import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/features/projects";
import { StatusBadge } from "./status-badge";
import { UPTIME_WINDOWS } from "../constants";
import type { ProjectUptimeSummary } from "../types";

/** Renders one uptime-window cell, "—" for a window with no data yet
 * (brand-new project, or a window entirely older than its first check). */
function UptimeCell({ value }: { value: number | null }) {
  return (
    <TableCell className="text-right tabular-nums text-muted-foreground">
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
          <TableHead>Last checked</TableHead>
          {UPTIME_WINDOWS.map((window) => (
            <TableHead key={window.key} className="text-right">
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
                {/* Not a link yet -- the per-project detail page is a
                    separate, later Phase 4 issue (#30-32); this cell will
                    become a Link once that route exists. */}
                <p className="font-medium">{project.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {project.health_url}
                </p>
              </TableCell>
              <TableCell
                className="text-muted-foreground"
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
              <UptimeCell value={summary?.uptime_24h ?? null} />
              <UptimeCell value={summary?.uptime_7d ?? null} />
              <UptimeCell value={summary?.uptime_30d ?? null} />
              <UptimeCell value={summary?.uptime_90d ?? null} />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
