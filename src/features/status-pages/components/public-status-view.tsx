import { ResponseTimeChart, StatusBadge, UPTIME_WINDOWS, UptimeHeatmap } from "@/features/dashboard";
import type { DailyHistoryPoint, ResponseTimeSeries } from "@/features/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/utils";
import type { PublicProjectStatus } from "../types";

function UptimeStat({ label, value }: { label: string; value: number | null }) {
  return (
    <Card>
      <CardContent className="px-4 py-4 sm:px-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value === null ? "—" : `${value}%`}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The public status page's actual content (PRD §5.6, Phase 8, #51):
 * project name/status, 24h/7d/30d/90d uptime %, a 24h response-time chart,
 * and the 90-day uptime heatmap -- reusing `StatusBadge`/`ResponseTimeChart`/
 * `UptimeHeatmap` from `features/dashboard` rather than rebuilding them, per
 * the issue's own instruction. A plain Server Component; every prop here is
 * data already fetched by the route (`src/app/status/[id]/page.tsx`) via
 * the `get_public_project_*` functions, never a direct client-side
 * Supabase call.
 *
 * `UptimeHeatmap`'s tooltips need a `TooltipProvider` ancestor (Radix). The
 * authenticated dashboard gets one for free from `SidebarProvider`
 * (`components/ui/sidebar.tsx`), which wraps every `/dashboard/*` page --
 * this route has no sidebar, so without an explicit wrapper here
 * `UptimeHeatmap` throws ("Tooltip must be used within TooltipProvider")
 * during server rendering and silently falls back to a client-rendered
 * retry (caught, but a real first-paint/console-error regression).
 * `TooltipProvider` is itself a Client Component, but wrapping Server
 * Component children with it here is the same composition pattern
 * `SidebarProvider` already relies on for the dashboard.
 */
export function PublicStatusView({
  status,
  dailyHistory,
  responseTimeSeries,
}: {
  status: PublicProjectStatus;
  dailyHistory: DailyHistoryPoint[];
  responseTimeSeries: ResponseTimeSeries;
}) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{status.name}</h1>
            <StatusBadge status={status.last_status} />
          </div>
          {status.description && (
            <p className="text-muted-foreground text-sm">{status.description}</p>
          )}
          <p className="text-muted-foreground text-sm">
            {status.last_checked_at
              ? `Last checked ${formatRelativeTime(status.last_checked_at)}`
              : "No checks recorded yet"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UptimeStat label={`Uptime (${UPTIME_WINDOWS[0].label})`} value={status.uptime_24h} />
          <UptimeStat label={`Uptime (${UPTIME_WINDOWS[1].label})`} value={status.uptime_7d} />
          <UptimeStat label={`Uptime (${UPTIME_WINDOWS[2].label})`} value={status.uptime_30d} />
          <UptimeStat label={`Uptime (${UPTIME_WINDOWS[3].label})`} value={status.uptime_90d} />
        </div>

        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Response time (last 24h)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <ResponseTimeChart series={responseTimeSeries} window="24h" />
          </CardContent>
        </Card>

        <UptimeHeatmap history={dailyHistory} />
      </div>
    </TooltipProvider>
  );
}
