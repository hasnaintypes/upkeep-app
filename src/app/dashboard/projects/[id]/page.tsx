import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCardSkeleton } from "@/components/ui/loading-skeletons";
import { SectionLabel } from "@/components/ui/section-label";
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
  parseCheckLogFilters,
  ProjectDetailHeader,
  ProjectHistoryTabs,
  ResponseTimeSection,
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
 * (#32) -- matching the PRD's own ordering for this page. Per-project
 * notification rule configuration (`ProjectNotificationRules`) deliberately
 * doesn't live here -- removed from this page's UI; channel management
 * itself is on /dashboard/settings.
 */
async function ProjectDetailLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    cursor?: string;
    dir?: string;
    status?: string;
    q?: string;
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
  const { cursor, dir, status, q, incidentCursor, incidentDir } = await searchParams;
  const checksCursor: CheckLogCursor | undefined =
    cursor && (dir === "next" || dir === "previous")
      ? { checkedAt: cursor, direction: dir }
      : undefined;
  const checkLogFilters = parseCheckLogFilters({ status, q });
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
    getProjectChecksPage(project.id, checkLogFilters, checksCursor),
  ]);
  const seriesByWindow = Object.fromEntries(seriesEntries) as Record<
    UptimeWindowKey,
    ResponseTimeSeries
  >;

  return (
    <div className="flex flex-col gap-8">
      <ProjectDetailHeader project={project} summary={summary} />

      <div className="flex flex-col gap-4">
        <SectionLabel>Monitoring</SectionLabel>
        <ResponseTimeSection seriesByWindow={seriesByWindow} />

        {historyError ? (
          <p className="text-sm text-destructive">
            Failed to load uptime history: {historyError}
          </p>
        ) : (
          <UptimeHeatmap history={dailyHistory ?? []} />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>History</SectionLabel>
        <ProjectHistoryTabs
          incidents={
            incidentsError ? (
              <p className="text-sm text-destructive">Failed to load incidents: {incidentsError}</p>
            ) : (
              <IncidentHistoryTable
                projectId={project.id}
                page={incidents ?? { rows: [], hasNext: false, hasPrevious: false }}
              />
            )
          }
          checkLog={
            checksError ? (
              <p className="text-sm text-destructive">Failed to load check log: {checksError}</p>
            ) : (
              <CheckLogTable
                projectId={project.id}
                page={checksPage ?? { rows: [], hasNext: false, hasPrevious: false }}
                filters={checkLogFilters}
                incidentCursor={incidentCursor}
                incidentDir={incidentDir}
              />
            )
          }
        />
      </div>
    </div>
  );
}

/** Mirrors the real page's shape (header card, monitoring charts, history
 * tabs) instead of two unrelated gray bars -- so the loading state doesn't
 * visibly jump in height/structure once the real content mounts. */
function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Card variant="soft">
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <ChartCardSkeleton />
        <ChartCardSkeleton height="h-40" />
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
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
    status?: string;
    q?: string;
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
