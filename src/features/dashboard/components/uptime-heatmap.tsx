import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEGRADED_DAY_THRESHOLD, DOWN_DAY_THRESHOLD, HEATMAP_CELL_COLOR } from "../constants";
import type { DailyHistoryPoint } from "../types";

type CellBucket = keyof typeof HEATMAP_CELL_COLOR;

/** Buckets a day's uptime % into one of the heatmap's color tiers. `null`
 * (source: "none", zero checks that day) is its own neutral bucket, not
 * folded into "down" -- a monitoring gap isn't the same signal as a real
 * outage (PRD §5.6, #31's "degrades gracefully" acceptance criterion). */
function cellBucket(point: DailyHistoryPoint): CellBucket {
  if (point.uptime_percentage === null) return "none";
  if (point.uptime_percentage >= DEGRADED_DAY_THRESHOLD) return "healthy";
  if (point.uptime_percentage >= DOWN_DAY_THRESHOLD) return "degraded";
  return "down";
}

/** Lowest opacity a colored (non-"none") bar ever renders at -- keeps even
 * the mildest day in a bucket visibly present rather than fading to
 * nothing. */
const MIN_INTENSITY = 0.45;

/** How strongly a day's bar renders within its own bucket's color -- not
 * just a flat 4-way palette, but a gradient of severity, so a day at 99.95%
 * uptime (barely degraded) doesn't read as visually identical to one at
 * 96% (barely hanging on before "down"). Scaled independently per bucket,
 * since each spans a very different %-uptime range (healthy is a 0.1-point
 * band from 99.9-100; down is a 95-point band from 0-95) -- a single global
 * scale would make the healthy band's own variation invisible. */
function cellIntensity(point: DailyHistoryPoint, bucket: CellBucket): number {
  if (point.uptime_percentage === null) return 1;
  const pct = point.uptime_percentage;

  const t =
    bucket === "healthy"
      ? (pct - DEGRADED_DAY_THRESHOLD) / (100 - DEGRADED_DAY_THRESHOLD)
      : bucket === "degraded"
        ? (DEGRADED_DAY_THRESHOLD - pct) / (DEGRADED_DAY_THRESHOLD - DOWN_DAY_THRESHOLD)
        : (DOWN_DAY_THRESHOLD - pct) / DOWN_DAY_THRESHOLD;

  return MIN_INTENSITY + (1 - MIN_INTENSITY) * Math.min(1, Math.max(0, t));
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

const LEGEND: { bucket: CellBucket; label: string }[] = [
  { bucket: "healthy", label: "Healthy" },
  { bucket: "degraded", label: "Partial outage" },
  { bucket: "down", label: "Major outage" },
  { bucket: "none", label: "No data" },
];

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
 * Each bar's opacity encodes severity within its bucket (`cellIntensity`),
 * not just a flat 4-color fill, so the strip reads as a genuine heat
 * gradient rather than four discrete swatches -- a day right at a
 * threshold looks meaningfully different from one deep inside it. Bars are
 * grouped into rolling 7-day columns (a slightly wider gap every 7th bar,
 * not calendar-week-aligned) purely to break up 90 identical-width tiles
 * into scannable chunks, and the most recent day gets a ring so the
 * "you are here" end of the strip is unambiguous when scrolled.
 *
 * A plain Server Component -- Radix's Tooltip primitives (`ui/tooltip.tsx`)
 * are Client Components themselves, but this component has no state or
 * effects of its own, so it doesn't need "use client" just to render them.
 */
export function UptimeHeatmap({ history }: { history: DailyHistoryPoint[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6">
        <CardTitle>Uptime history</CardTitle>
        <CardAction className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {LEGEND.map(({ bucket, label }) => (
            <span key={bucket} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", HEATMAP_CELL_COLOR[bucket])} />
              {label}
            </span>
          ))}
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="flex items-end gap-1 overflow-x-auto pb-2">
          {history.map((point, index) => {
            const bucket = cellBucket(point);
            const isToday = index === history.length - 1;

            return (
              <Tooltip key={point.day}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${formatDay(point.day)}: ${
                      point.uptime_percentage === null
                        ? "no checks recorded"
                        : `${point.uptime_percentage}% uptime`
                    }`}
                    style={bucket === "none" ? undefined : { opacity: cellIntensity(point, bucket) }}
                    className={cn(
                      "h-10 w-2.5 shrink-0 origin-bottom rounded-[3px] transition-transform duration-150 ease-out hover:scale-y-110 focus-visible:scale-y-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      bucket === "none"
                        ? "bg-[repeating-linear-gradient(135deg,var(--color-border)_0px,var(--color-border)_2px,transparent_2px,transparent_5px)]"
                        : HEATMAP_CELL_COLOR[bucket],
                      isToday && "ring-1 ring-foreground/50 ring-offset-1 ring-offset-background",
                      (index + 1) % 7 === 0 && "mr-2",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <CellTooltip point={point} />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
