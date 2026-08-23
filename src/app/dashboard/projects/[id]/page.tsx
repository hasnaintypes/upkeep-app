import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjectById } from "@/features/projects";
import {
  getProjectUptimeSummaries,
  getResponseTimeSeries,
  ResponseTimeSection,
  StatusBadge,
  UPTIME_WINDOWS,
} from "@/features/dashboard";
import type { ResponseTimeSeries, UptimeWindowKey } from "@/features/dashboard";

/**
 * Per-project detail page (PRD §5.6, Phase 4). Currently just the
 * response-time graph section (#30); the uptime heatmap/timeline (#31) and
 * raw check log (#32) are separate, later Phase 4 issues that will add
 * more sections to this same page.
 */
async function ProjectDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { id } = await params;

  const [{ data: project, error: projectError }, { data: summaries }] = await Promise.all([
    getProjectById(id),
    getProjectUptimeSummaries(),
  ]);

  if (projectError || !project) {
    return (
      <p className="text-sm text-destructive">{projectError ?? "Project not found."}</p>
    );
  }

  const summary = summaries?.find((s) => s.project_id === project.id) ?? null;

  const seriesEntries = await Promise.all(
    UPTIME_WINDOWS.map(async (w) => {
      const { data } = await getResponseTimeSeries(project.id, w.key);
      return [w.key, data] as const;
    }),
  );
  const seriesByWindow = Object.fromEntries(seriesEntries) as Record<
    UptimeWindowKey,
    ResponseTimeSeries
  >;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Projects
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <StatusBadge status={summary?.last_status ?? null} />
        </div>
        {project.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {project.method} {project.health_url}
        </p>
      </div>

      <ResponseTimeSection seriesByWindow={seriesByWindow} />
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ProjectDetailSkeleton />}>
      <ProjectDetailLoader params={params} />
    </Suspense>
  );
}
