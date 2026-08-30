"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ResponseTimeSeries, UptimeWindowKey } from "../types";

const chartConfig = {
  responseTimeMs: {
    label: "Response time",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type ChartPoint = {
  timestamp: string;
  responseTimeMs: number | null;
  failureMarker: number | null;
  failureLabel: string | null;
};

/** Above this many points, the 24h/7d raw windows get bucketed down for
 * display (see `downsampleChartPoints`) instead of plotting every single
 * check. */
const MAX_RAW_CHART_POINTS = 200;

/**
 * Buckets `points` down to roughly `maxPoints` when there are more than
 * that -- a project's `check_interval_seconds` has no enforced minimum
 * (and the prober's own base tick is every minute), so a frequently-checked
 * project's 24h/7d raw window can easily have 700-2000+ points. Plotting
 * every one of those as its own line vertex on a ~1200px-wide chart puts
 * several points per horizontal pixel, which renders as a dense, unreadable
 * zigzag rather than a legible trend -- this is what fixes that, not a
 * change to the underlying data (the check log table still shows every
 * individual check).
 *
 * Each bucket's response time is the average of its non-failed points
 * (failed/timed-out points are excluded so one outage doesn't drag a
 * healthy bucket's average toward zero); a bucket containing any failures
 * still surfaces its own failure marker, just combined into one point
 * instead of one per failed check.
 *
 * The failure marker's height is deliberately based on the *bucketed*
 * averages' own max, not the pre-bucketed raw max -- a single sharp spike
 * gets smoothed away by averaging, so sizing the marker off the raw max
 * would place it far above where the (now-smoothed) line ever actually
 * reaches, forcing the Y-axis to scale to that unreachable height and
 * leaving most of the chart's vertical space empty above a squashed line.
 */
function downsampleChartPoints(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (points.length <= maxPoints) return points;

  const bucketSize = Math.ceil(points.length / maxPoints);
  const buckets: { timestamp: string; responseTimeMs: number | null; failureLabel: string | null }[] =
    [];

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    const healthy = bucket.filter(
      (p): p is ChartPoint & { responseTimeMs: number } => p.responseTimeMs !== null,
    );
    const failures = bucket.filter((p) => p.failureLabel !== null);

    buckets.push({
      timestamp: bucket[bucket.length - 1].timestamp,
      responseTimeMs:
        healthy.length > 0
          ? Math.round(healthy.reduce((sum, p) => sum + p.responseTimeMs, 0) / healthy.length)
          : null,
      failureLabel:
        failures.length === 0
          ? null
          : failures.length === 1
            ? failures[0].failureLabel
            : `${failures.length} checks failed in this period`,
    });
  }

  const meaningfulMax = Math.max(1, ...buckets.map((b) => b.responseTimeMs ?? 0));
  const markerHeight = meaningfulMax * 1.1;

  return buckets.map((b) => ({
    ...b,
    failureMarker: b.failureLabel !== null ? markerHeight : null,
  }));
}

/** Always renders in seconds ("0.35s", "1.4s", "0s") instead of switching
 * units at the 1000ms mark -- a fixed-width "Nms"/"N.Ns" mix reads as
 * inconsistent across a single axis (e.g. "700ms" next to "1.4s"), whereas
 * one unit throughout stays both consistent and short. `toFixed(2)` then
 * `Number(...)` trims trailing zeros (0.70 -> "0.7", 1.00 -> "1"). */
function formatResponseTimeTick(ms: number): string {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

/** 24h -> time of day; 7d -> weekday + time; 30d/90d (aggregated, one point
 * per day) -> date. Matches how much detail is actually useful at each
 * range instead of one generic format for all four. */
function formatTick(iso: string, window: UptimeWindowKey): string {
  const date = new Date(iso);
  if (window === "24h") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (window === "7d") {
    return date.toLocaleDateString(undefined, { weekday: "short", hour: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Normalizes either series shape (raw per-check points, or per-period
 * `checks_aggregated` rollups) into one common array `ComposedChart` can
 * render the same way. Failed/timed-out points (raw) and periods that had
 * any failures (aggregated) get `responseTimeMs: null` -- so the response-
 * time line has a real gap there instead of a misleading dip toward zero
 * or a spike showing the full timeout duration as if it were latency (PRD
 * §5.6, #30's acceptance criteria) -- plus a `failureMarker` placed at the
 * series' own max value, rendered as a separate Scatter layer, so failures
 * are visually distinguished rather than omitted.
 */
function toChartPoints(series: ResponseTimeSeries): ChartPoint[] {
  if (series.kind === "raw") {
    const meaningfulMax = Math.max(
      1,
      ...series.points.map((p) => (p.failed ? 0 : (p.responseTimeMs ?? 0))),
    );
    const markerHeight = meaningfulMax * 1.1;

    return series.points.map((p) => ({
      timestamp: p.checkedAt,
      responseTimeMs: p.failed ? null : p.responseTimeMs,
      failureMarker: p.failed ? markerHeight : null,
      failureLabel: p.failed ? `Check failed (${p.status})` : null,
    }));
  }

  const meaningfulMax = Math.max(1, ...series.points.map((p) => p.avgResponseTimeMs));
  const markerHeight = meaningfulMax * 1.1;

  return series.points.map((p) => ({
    timestamp: p.periodStart,
    responseTimeMs: p.totalFailures > 0 ? null : p.avgResponseTimeMs,
    failureMarker: p.totalFailures > 0 ? markerHeight : null,
    failureLabel:
      p.totalFailures > 0 ? `${p.totalFailures}/${p.totalChecks} checks failed this period` : null,
  }));
}

function ChartTooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="grid min-w-[10rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium text-foreground">
        {new Date(point.timestamp).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
      {point.failureLabel ? (
        <span className="text-destructive">{point.failureLabel}</span>
      ) : point.responseTimeMs !== null ? (
        <span className="font-mono text-muted-foreground">
          {point.responseTimeMs.toLocaleString()}ms
        </span>
      ) : (
        <span className="text-muted-foreground">No data</span>
      )}
    </div>
  );
}

/**
 * Per-project response-time graph (PRD §5.6, Phase 4, #30): plots
 * `checks.response_time_ms` (or `checks_aggregated.avg_response_time_ms`
 * for 30d/90d) against time, with failed/timed-out points marked
 * separately instead of plotted as zero or silently dropped.
 */
export function ResponseTimeChart({
  series,
  window,
}: {
  series: ResponseTimeSeries;
  window: UptimeWindowKey;
}) {
  const data = useMemo(() => {
    const points = toChartPoints(series);
    // 30d/90d ("aggregated") are already one point per day, server-side --
    // only the 24h/7d raw windows can get dense enough to need this.
    return series.kind === "raw" ? downsampleChartPoints(points, MAX_RAW_CHART_POINTS) : points;
  }, [series]);

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        {series.kind === "aggregated"
          ? "No aggregated data yet for this range -- it fills in once daily rollups start running."
          : "No checks recorded yet for this range."}
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillResponseTime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-responseTimeMs)" stopOpacity={1.0} />
            <stop offset="95%" stopColor="var(--color-responseTimeMs)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => formatTick(value, window)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={46}
          tickFormatter={formatResponseTimeTick}
        />
        <ChartTooltip content={<ChartTooltipBody />} />
        <Area
          dataKey="responseTimeMs"
          type="natural"
          fill="url(#fillResponseTime)"
          stroke="var(--color-responseTimeMs)"
          connectNulls={false}
        />
        <Scatter dataKey="failureMarker" fill="var(--destructive)" shape="cross" />
      </ComposedChart>
    </ChartContainer>
  );
}
