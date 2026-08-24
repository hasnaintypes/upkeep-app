import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjectById } from "@/features/projects";
import {
  CheckLogTable,
  getProjectChecksPage,
  getProjectDailyHistory,
  getProjectIncidentsPage,
  getProjectUptimeSummaries,
  getResponseTimeSeries,
  IncidentHistoryTable,
  ResponseTimeSection,
  StatusBadge,
  UptimeHeatmap,
  UPTIME_WINDOWS,
} from "@/features/dashboard";
import type {
  CheckLogCursor,
  IncidentCursor,
  ResponseTimeSeries,
  UptimeWindowKey,
} from "@/features/dashboard";

/**
 * Per-project detail page (PRD §5.6, Phase 4/5): response-time graph (#30),
 * uptime heatmap/timeline (#31), incident history (#38), and raw check log
 * (#32) -- matching the PRD's own ordering for this page.
 */
async function ProjectDetailLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    cursor?: string;
    dir?: string;
    incidentCursor?: string;
    incidentDir?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { id } = await params;
  const { cursor, dir, incidentCursor, incidentDir } = await searchParams;
  const checksCursor: CheckLogCursor | undefined =
    cursor && (dir === "next" || dir === "previous")
      ? { checkedAt: cursor, direction: dir }
      : undefined;
  const incidentsCursor: IncidentCursor | undefined =
    incidentCursor && (incidentDir === "next" || incidentDir === "previous")
      ? { startedAt: incidentCursor, direction: incidentDir }
      : undefined;

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

  const [
    seriesEntries,
    { data: dailyHistory, error: historyError },
    { data: incidents, error: incidentsError },
    { data: checksPage, error: checksError },
  ] = await Promise.all([
    Promise.all(
      UPTIME_WINDOWS.map(async (w) => {
        const { data } = await getResponseTimeSeries(project.id, w.key);
        return [w.key, data] as const;
      }),
    ),
    getProjectDailyHistory(project.id),
    getProjectIncidentsPage(project.id, incidentsCursor),
    getProjectChecksPage(project.id, checksCursor),
  ]);
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

      {historyError ? (
        <p className="text-sm text-destructive">
          Failed to load uptime history: {historyError}
        </p>
      ) : (
        <UptimeHeatmap history={dailyHistory ?? []} />
      )}

      {incidentsError ? (
        <p className="text-sm text-destructive">Failed to load incidents: {incidentsError}</p>
      ) : (
        <IncidentHistoryTable
          projectId={project.id}
          page={incidents ?? { rows: [], hasNext: false, hasPrevious: false }}
        />
      )}

      {checksError ? (
        <p className="text-sm text-destructive">Failed to load check log: {checksError}</p>
      ) : (
        <CheckLogTable
          projectId={project.id}
          page={checksPage ?? { rows: [], hasNext: false, hasPrevious: false }}
        />
      )}
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    cursor?: string;
    dir?: string;
    incidentCursor?: string;
    incidentDir?: string;
  }>;
}) {
  return (
    <Suspense fallback={<ProjectDetailSkeleton />}>
      <ProjectDetailLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}
