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
  const data = useMemo(() => toChartPoints(series), [series]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {series.kind === "aggregated"
          ? "No aggregated data yet for this range -- it fills in once daily rollups start running."
          : "No checks recorded yet for this range."}
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillResponseTime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-responseTimeMs)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-responseTimeMs)" stopOpacity={0.05} />
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
          width={48}
          tickFormatter={(value: number) => `${value}ms`}
        />
        <ChartTooltip content={<ChartTooltipBody />} />
        <Area
          dataKey="responseTimeMs"
          type="monotone"
          fill="url(#fillResponseTime)"
          stroke="var(--color-responseTimeMs)"
          connectNulls={false}
        />
        <Scatter dataKey="failureMarker" fill="var(--destructive)" shape="cross" />
      </ComposedChart>
    </ChartContainer>
  );
}
