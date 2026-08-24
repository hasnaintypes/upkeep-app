import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddProjectTrigger, getActiveProjects } from "@/features/projects";
import {
  filterOverviewRows,
  getAvailableProviders,
  getAvailableTags,
  getProjectUptimeSummaries,
  hasActiveFilters,
  OverviewFilterBar,
  OverviewTable,
  parseOverviewFilters,
  type OverviewSearchParams,
} from "@/features/dashboard";

/**
 * Dashboard overview page (PRD §5.6, Phase 4, issues #29 and #33): every
 * active project owned by the signed-in user, with current status,
 * last-checked time, rolling 24h/7d/30d/90d uptime %, and filter/search
 * controls (name search, tag/hosting-provider/status multi-select).
 *
 * `OverviewLoader` does the auth guard + both data fetches (RLS-scoped
 * project list + the get_project_uptime_summary() RPC, one round trip each
 * -- see features/dashboard/lib/queries.ts) and is wrapped in `<Suspense>`,
 * per this project's standard pattern for isolating dynamic data access
 * under `cacheComponents: true` (see src/app/dashboard/projects/page.tsx
 * and AGENTS.md's Gotchas section). Filtering itself happens entirely
 * in-memory against the already-fetched active-project list (see
 * lib/filters.ts) -- this app's scale (~50 projects, PRD §9) doesn't
 * warrant building dynamic SQL for what's ultimately a handful of
 * `Array.filter` predicates over data already in hand.
 */
async function OverviewLoader({
  searchParams,
}: {
  searchParams: Promise<OverviewSearchParams>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const [{ data: projects, error: projectsError }, { data: summaries, error: summaryError }] =
    await Promise.all([getActiveProjects(), getProjectUptimeSummaries()]);

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

  if (!projects || projects.length === 0) {
    return (
      <Card variant="soft" className="flex flex-col items-center gap-3 p-6 text-center sm:p-10">
        <CardTitle className="text-base">No active projects yet</CardTitle>
        <CardDescription>
          Add a project and activate it to see its status here.
        </CardDescription>
        <Suspense fallback={<Button disabled>Add project</Button>}>
          <AddProjectTrigger trigger={<Button>Add project</Button>} />
        </Suspense>
      </Card>
    );
  }

  const filters = parseOverviewFilters(await searchParams);
  const availableTags = getAvailableTags(projects);
  const availableProviders = getAvailableProviders(projects);
  const summaryByProjectId = new Map((summaries ?? []).map((s) => [s.project_id, s]));
  const filteredProjects = filterOverviewRows(projects, summaryByProjectId, filters);

  return (
    <div className="flex flex-col gap-4">
      <OverviewFilterBar
        filters={filters}
        availableTags={availableTags}
        availableProviders={availableProviders}
        pathname="/dashboard"
      />
      {filteredProjects.length === 0 ? (
        <Card variant="soft" className="flex flex-col items-center gap-3 p-6 text-center sm:p-10">
          <CardTitle className="text-base">No projects match your filters</CardTitle>
          <CardDescription>Try removing a filter or searching for something else.</CardDescription>
          {hasActiveFilters(filters) && (
            <Button variant="outline" asChild>
              <Link href="/dashboard">Clear filters</Link>
            </Button>
          )}
        </Card>
      ) : (
        <OverviewTable projects={filteredProjects} summaries={summaries ?? []} />
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<OverviewSearchParams>;
}) {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Current status and uptime for every active project.
        </p>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
