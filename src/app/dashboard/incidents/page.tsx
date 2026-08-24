import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjects } from "@/features/projects";
import {
  GlobalIncidentTable,
  getIncidentsPage,
  IncidentFilterBar,
  parseGlobalIncidentFilters,
  type GlobalIncidentSearchParams,
  type IncidentCursor,
} from "@/features/dashboard";

/**
 * Global incident history page (PRD §5.4, Phase 5, #39): every incident
 * across every project the signed-in user owns, most recent first,
 * filterable by project/status/time-range and keyset-paginated -- see
 * `getIncidentsPage`. `IncidentsLoader` does the auth guard + both data
 * fetches (RLS-scoped project list, for the project filter's own options
 * and each row's "which project" label/link, and the incidents page
 * itself) and is wrapped in `<Suspense>`, per this project's standard
 * pattern for isolating dynamic data access under `cacheComponents: true`
 * (see AGENTS.md's Gotchas section).
 *
 * Uses every project the user owns (`getProjects`), not just active ones
 * (`getActiveProjects`, the overview page's own choice, #29) -- a paused
 * project's past incidents are still real history, and #39's own
 * acceptance criterion says "every project the signed-in user owns."
 */
async function IncidentsLoader({
  searchParams,
}: {
  searchParams: Promise<GlobalIncidentSearchParams>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const resolvedSearchParams = await searchParams;
  const filters = parseGlobalIncidentFilters(resolvedSearchParams);
  const { cursor, dir } = resolvedSearchParams;
  const incidentCursor: IncidentCursor | undefined =
    cursor && (dir === "next" || dir === "previous")
      ? { startedAt: cursor, direction: dir }
      : undefined;

  const [{ data: projects, error: projectsError }, { data: incidentsPage, error: incidentsError }] =
    await Promise.all([getProjects(), getIncidentsPage(filters, incidentCursor)]);

  if (projectsError) {
    return <p className="text-sm text-destructive">Failed to load projects: {projectsError}</p>;
  }
  if (incidentsError) {
    return <p className="text-sm text-destructive">Failed to load incidents: {incidentsError}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <IncidentFilterBar
        filters={filters}
        projects={projects ?? []}
        pathname="/dashboard/incidents"
      />
      <GlobalIncidentTable
        page={incidentsPage ?? { rows: [], hasNext: false, hasPrevious: false }}
        filters={filters}
      />
    </div>
  );
}

function IncidentsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<GlobalIncidentSearchParams>;
}) {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          Every incident across every project you own, most recent first.
        </p>
      </div>
      <Suspense fallback={<IncidentsSkeleton />}>
        <IncidentsLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
