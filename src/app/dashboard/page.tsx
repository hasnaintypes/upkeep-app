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
  type PortfolioIncidentDailyPoint,
} from "@/features/dashboard";

/**
 * TEMPORARY -- landing-page screenshot only. Real portfolios rarely have
 * enough incident history yet to make this chart look like anything on a
 * fresh screenshot; this hardcodes a plausible-looking 30-day
 * opened/resolved pattern instead. `getPortfolioIncidentDailyCounts()` is
 * still called below (its error is still checked, same as before) -- only
 * its `data` is left unused, and only `PortfolioIncidentsChart`'s own
 * `points` prop is swapped out.
 *
 * TO REVERT: delete this function and its two `DUMMY_*` arrays, re-add
 * `data: incidentDailyCounts` to the destructure below, and change
 * `PortfolioIncidentsChart`'s `points` prop back to
 * `incidentDailyCounts ?? []`.
 */
const DUMMY_OPENED = [
  1, 0, 2, 1, 0, 0, 3, 2, 1, 0, 1, 4, 2, 0, 1, 0, 2, 3, 1, 0, 0, 1, 2, 0, 3, 1, 0, 2, 1, 0,
];
const DUMMY_RESOLVED = [
  0, 1, 1, 2, 0, 0, 2, 3, 1, 1, 0, 3, 3, 1, 0, 1, 1, 2, 2, 1, 0, 0, 2, 1, 2, 2, 1, 1, 2, 0,
];
function buildDummyIncidentDailyCounts(): PortfolioIncidentDailyPoint[] {
  const days = DUMMY_OPENED.length;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (days - 1 - i));
    return {
      day: date.toISOString().slice(0, 10),
      opened: DUMMY_OPENED[i],
      resolved: DUMMY_RESOLVED[i],
    };
  });
}

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
    // `data` (the real 30-day counts) is intentionally unused for now --
    // see `buildDummyIncidentDailyCounts`'s doc comment above. The query
    // still runs and its error is still checked below, so reverting this
    // is just re-adding `data: incidentDailyCounts` here.
    { error: incidentDailyError },
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
        {/* TEMP: swapped for dummy data, see buildDummyIncidentDailyCounts's own doc comment above */}
        <PortfolioIncidentsChart points={buildDummyIncidentDailyCounts()} />
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
