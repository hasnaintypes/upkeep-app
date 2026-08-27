import Link from "next/link";
import { StatusBadge } from "@/features/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { PublicProjectSummary } from "../types";

/**
 * The aggregate portfolio status page's actual content (PRD §5.6, Phase 8,
 * #53): every currently-public project, its live status, a headline 90-day
 * uptime %, and a link out to that project's own full #51 page (status,
 * all four uptime windows, response-time chart, heatmap). A plain Server
 * Component -- `projects` is already fetched by the route
 * (`src/app/status/page.tsx`) via `getPublicProjectsSummary`, never a
 * direct client-side Supabase call.
 *
 * 90 days (not 24h) is the headline figure here deliberately -- a portfolio
 * *list* is a scan-at-a-glance view (status.io/statuspage.io convention),
 * where a longer window is more representative of a service's general
 * reliability than a single day; the per-project page linked to from each
 * row already shows the full 24h/7d/30d/90d breakdown for anyone who wants
 * more detail.
 */
export function PublicPortfolioView({ projects }: { projects: PublicProjectSummary[] }) {
  if (projects.length === 0) {
    return (
      <Card variant="soft" className="flex flex-col items-center gap-1 p-6 text-center sm:p-10">
        <p className="font-medium">No public projects yet</p>
        <p className="text-sm text-muted-foreground">
          Nothing in this portfolio has been made public.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/status/${project.id}`} className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{project.name}</p>
                  <StatusBadge status={project.last_status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {project.last_checked_at
                    ? `Last checked ${formatRelativeTime(project.last_checked_at)}`
                    : "No checks recorded yet"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Uptime (90d)</p>
                <p className="text-lg font-semibold tabular-nums">
                  {project.uptime_90d === null ? "—" : `${project.uptime_90d}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
