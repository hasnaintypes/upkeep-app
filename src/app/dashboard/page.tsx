import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FolderIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartCardSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/ui/loading-skeletons";
import { SectionLabel } from "@/components/ui/section-label";
import { AddProjectTrigger, getActiveProjects } from "@/features/projects";
import {
  getOpenIncidentCount,
  getPortfolioIncidentDailyCounts,
  getProjectUptimeSummaries,
  OverviewStats,
  OverviewTable,
  PortfolioIncidentsChart,
} from "@/features/dashboard";

/**
 * Dashboard overview page (PRD §5.6, Phase 4, issues #29 and #33): every
 * active project owned by the signed-in user, with current status,
 * last-checked time, and rolling 24h/7d/30d/90d uptime %. Above the table,
 * a portfolio-wide scan layer: `OverviewStats`' four stat cards (active
 * projects, 7d portfolio uptime, down now, open incidents) and
 * `PortfolioIncidentsChart`'s daily opened-vs-resolved incidents chart --
 * deliberately not a repeat of the per-project detail page's single-project
 * response-time chart / heatmap, this is portfolio-wide (every project at
 * once) rather than one project over time.
 *
 * `OverviewLoader` does the auth guard + all four data fetches (RLS-scoped
 * project list, the get_project_uptime_summary() RPC, an open-incident
 * count, and 30 days of daily incident counts -- one round trip each, see
 * features/dashboard/lib/queries.ts) and is wrapped in `<Suspense>`, per
 * this project's standard pattern for isolating dynamic data access under
 * `cacheComponents: true` (see src/app/dashboard/projects/page.tsx and
 * AGENTS.md's Gotchas section). Search/filter/sort of the fetched list
 * happens entirely client-side in `OverviewTable` (the same TanStack Table
 * v9 shell as Projects/API keys) -- this app's scale (~50 projects, PRD §9)
 * doesn't warrant a server round trip per filter change; the stat cards
 * reuse that same already-fetched project/summary data (no extra round
 * trip beyond the two incident queries).
 */
async function OverviewLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const [
    { data: projects, error: projectsError },
    { data: summaries, error: summaryError },
    { data: openIncidents, error: incidentError },
    { data: incidentDailyCounts, error: incidentDailyError },
  ] = await Promise.all([
    getActiveProjects(),
    getProjectUptimeSummaries(),
    getOpenIncidentCount(),
    getPortfolioIncidentDailyCounts(),
  ]);

  if (projectsError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load projects: {projectsError}
      </p>
    );
  }
  if (summaryError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load uptime data: {summaryError}
      </p>
    );
  }
  if (incidentError || incidentDailyError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load incident data: {incidentError ?? incidentDailyError}
      </p>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        icon={FolderIcon}
        title="No active projects yet"
        description="Add a project and activate it to see its status here."
        action={
          <Suspense fallback={<Button disabled>Add project</Button>}>
            <AddProjectTrigger trigger={<Button>Add project</Button>} />
          </Suspense>
        }
      />
    );
  }

  const resolvedSummaries = summaries ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <SectionLabel>Metrics</SectionLabel>
        <OverviewStats
          projects={projects}
          summaries={resolvedSummaries}
          openIncidents={openIncidents}
        />
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Activity</SectionLabel>
        <PortfolioIncidentsChart points={incidentDailyCounts ?? []} />
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Projects</SectionLabel>
        <OverviewTable projects={projects} summaries={resolvedSummaries} />
      </div>
    </div>
  );
}

/** Mirrors the real page's three sections (stat cards, incidents chart,
 * project table) instead of a single table-shaped skeleton that ignores the
 * two sections above it. */
function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <StatCardsSkeleton />
      <ChartCardSkeleton height="h-64" />
      <TableSkeleton columns={6} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Current status and uptime for every active project.
        </p>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewLoader />
      </Suspense>
    </div>
  );
}
