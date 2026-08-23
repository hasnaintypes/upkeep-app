import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveProjects } from "@/features/projects";
import { getProjectUptimeSummaries, OverviewTable } from "@/features/dashboard";

/**
 * Dashboard overview page (PRD §5.6, Phase 4, issue #29): every active
 * project owned by the signed-in user, with current status, last-checked
 * time, and rolling 24h/7d/30d/90d uptime %.
 *
 * `OverviewLoader` does the auth guard + both data fetches (RLS-scoped
 * project list + the get_project_uptime_summary() RPC, one round trip each
 * -- see features/dashboard/lib/queries.ts) and is wrapped in `<Suspense>`,
 * per this project's standard pattern for isolating dynamic data access
 * under `cacheComponents: true` (see src/app/dashboard/projects/page.tsx
 * and AGENTS.md's Gotchas section).
 */
async function OverviewLoader() {
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
      <Card variant="soft" className="flex flex-col items-center gap-3 p-10 text-center">
        <CardTitle className="text-base">No active projects yet</CardTitle>
        <CardDescription>
          Add a project and activate it to see its status here.
        </CardDescription>
        <Button asChild>
          <Link href="/dashboard/projects/new">Add project</Link>
        </Button>
      </Card>
    );
  }

  return <OverviewTable projects={projects} summaries={summaries ?? []} />;
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

export default function DashboardPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
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
