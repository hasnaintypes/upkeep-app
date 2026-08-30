"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PortfolioIncidentDailyPoint } from "../types";

/** `resolved` reuses `--chart-2` (the same green-leaning token
 * `ResponseTimeChart` avoids only because that chart is about latency, not
 * status) -- `opened` uses `--destructive` directly, matching how every
 * other incident-adjacent UI in this app (StatusBadge's "down" variant,
 * IncidentRow) marks incidents as the destructive-severity case. */
const chartConfig = {
  incidents: { label: "Incidents" },
  opened: { label: "Opened", color: "var(--destructive)" },
  resolved: { label: "Resolved", color: "var(--chart-2)" },
} satisfies ChartConfig;

type MetricKey = "opened" | "resolved";

const METRIC_KEYS: MetricKey[] = ["opened", "resolved"];

/** Parses a `YYYY-MM-DD` bucket key as a local-midnight `Date`, not
 * `new Date("YYYY-MM-DD")`'s UTC-midnight interpretation -- the latter
 * shifts the displayed day back by one for any negative UTC offset,
 * mislabeling every bar in that timezone. */
function parseBucketDay(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

/**
 * Portfolio-wide incidents chart for the dashboard overview page: daily
 * incidents-opened vs incidents-resolved across every project the user
 * owns, for the last 30 days. Deliberately a time series (unlike the stat
 * cards above it) but a portfolio-wide one -- distinct from the per-project
 * detail page's `ResponseTimeChart` (a single project's latency over time)
 * and `UptimeHeatmap` (a single project's daily uptime).
 *
 * Same interactive header pattern as shadcn's own bar-chart block: the two
 * metric totals double as toggle buttons for which series the chart plots,
 * instead of a separate legend or a stacked bar -- opened/resolved are
 * different-enough concepts (a count of new incidents vs a count of
 * incidents that stopped being open that day) that overlaying both as one
 * stacked bar per day would be harder to read than switching between them.
 */
export function PortfolioIncidentsChart({
  points,
}: {
  points: PortfolioIncidentDailyPoint[];
}) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("opened");

  const totals = useMemo(
    () => ({
      opened: points.reduce((sum, p) => sum + p.opened, 0),
      resolved: points.reduce((sum, p) => sum + p.resolved, 0),
    }),
    [points],
  );

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-4 pt-4 pb-3 sm:px-6 sm:py-0!">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Incidents</CardTitle>
            <Link
              href="/dashboard/incidents"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          </div>
          <CardDescription>Opened vs resolved across your portfolio, last 30 days</CardDescription>
        </div>
        <div className="flex">
          {METRIC_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              data-active={activeMetric === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
              onClick={() => setActiveMetric(key)}
            >
              <span className="text-xs text-muted-foreground">{chartConfig[key].label}</span>
              <span className="text-lg leading-none font-bold tabular-nums sm:text-2xl">
                {/* Explicit locale, not a bare `toLocaleString()` -- this is a
                Client Component rendered on the server and then hydrated;
                the runtime's default locale can differ between the two,
                which trips React's hydration-mismatch check (see
                `formatDateTime`'s own comment in lib/utils.ts for the same
                issue with dates). */}
                {totals[key].toLocaleString("en-US")}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart accessibilityLayer data={points} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) =>
                parseBucketDay(value).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[160px]"
                  nameKey="incidents"
                  labelFormatter={(value) =>
                    parseBucketDay(value as string).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }
                />
              }
            />
            <Bar dataKey={activeMetric} fill={`var(--color-${activeMetric})`} radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
