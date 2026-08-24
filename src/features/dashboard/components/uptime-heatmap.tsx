import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEGRADED_DAY_THRESHOLD, DOWN_DAY_THRESHOLD, HEATMAP_CELL_COLOR } from "../constants";
import type { DailyHistoryPoint } from "../types";

/** Buckets a day's uptime % into one of the heatmap's color tiers. `null`
 * (source: "none", zero checks that day) is its own neutral bucket, not
 * folded into "down" -- a monitoring gap isn't the same signal as a real
 * outage (PRD §5.6, #31's "degrades gracefully" acceptance criterion). */
function cellBucket(point: DailyHistoryPoint): keyof typeof HEATMAP_CELL_COLOR {
  if (point.uptime_percentage === null) return "none";
  if (point.uptime_percentage >= DEGRADED_DAY_THRESHOLD) return "healthy";
  if (point.uptime_percentage >= DOWN_DAY_THRESHOLD) return "degraded";
  return "down";
}

function formatDay(day: string): string {
  // `day` is a plain "YYYY-MM-DD" date (Postgres `date`, no time/timezone
  // component) -- parsing as UTC and formatting with a fixed UTC timeZone
  // keeps the displayed date stable regardless of the viewer's own
  // timezone, since there's no time-of-day for a timezone shift to affect.
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CellTooltip({ point }: { point: DailyHistoryPoint }) {
  if (point.uptime_percentage === null) {
    return (
      <>
        <p className="font-medium">{formatDay(point.day)}</p>
        <p className="text-muted-foreground">No checks recorded</p>
      </>
    );
  }

  return (
    <>
      <p className="font-medium">{formatDay(point.day)}</p>
      <p>{point.uptime_percentage}% uptime</p>
      <p className="text-muted-foreground">
        {point.total_failures} / {point.total_checks} checks failed
      </p>
    </>
  );
}

/**
 * Per-project uptime heatmap/timeline (PRD §5.6, Phase 4, #31): one bar per
 * day for the last 90 days, color-coded by that day's aggregate uptime %
 * (from `get_project_daily_history()`, not just the day's last check),
 * status-page.io style -- a single scrollable row rather than a GitHub-
 * style multi-week grid, so "oldest -> newest, left -> right" reads
 * unambiguously and the only responsive behavior needed for narrow
 * viewports is horizontal scroll (acceptance criteria's "horizontal scroll
 * or reflow, not overflow/clipping").
 *
 * A plain Server Component -- Radix's Tooltip primitives (`ui/tooltip.tsx`)
 * are Client Components themselves, but this component has no state or
 * effects of its own, so it doesn't need "use client" just to render them.
 */
export function UptimeHeatmap({ history }: { history: DailyHistoryPoint[] }) {
  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>Uptime history</CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="flex gap-0.5 overflow-x-auto pb-2">
          {history.map((point) => (
            <Tooltip key={point.day}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${formatDay(point.day)}: ${
                    point.uptime_percentage === null
                      ? "no checks recorded"
                      : `${point.uptime_percentage}% uptime`
                  }`}
                  className={cn(
                    "h-8 w-2 shrink-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:opacity-80 focus-visible:outline-none",
                    HEATMAP_CELL_COLOR[cellBucket(point)],
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                <CellTooltip point={point} />
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", HEATMAP_CELL_COLOR.healthy)} />
            Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", HEATMAP_CELL_COLOR.degraded)} />
            Partial outage
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", HEATMAP_CELL_COLOR.down)} />
            Major outage
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", HEATMAP_CELL_COLOR.none)} />
            No data
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
