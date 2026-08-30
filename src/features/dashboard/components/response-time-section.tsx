"use client";

import { useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UPTIME_WINDOWS } from "../constants";
import type { ResponseTimeSeries, UptimeWindowKey } from "../types";
import { ResponseTimeChart } from "./response-time-chart";

/** Full-sentence range labels, for the description text and the mobile
 * `Select`'s options -- `UPTIME_WINDOWS`'s own labels ("24h", "7d", ...)
 * stay short for the `ToggleGroup`, where space is tighter. */
const RANGE_LABELS: Record<UptimeWindowKey, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

/**
 * Response-time graph section for the per-project detail page (PRD §5.6,
 * Phase 4, #30), with a 24h/7d/30d/90d range switcher matching the overview
 * page's own windows (`UPTIME_WINDOWS`).
 *
 * The switcher itself is a `ToggleGroup` (wide cards) that collapses to a
 * `Select` dropdown (narrow cards/mobile) via container queries on the
 * `Card` -- same responsive pattern as shadcn's own interactive-chart block
 * -- rather than the plain button row this used before, which just wrapped
 * onto a second line at narrow widths.
 *
 * All four windows' data is fetched once, server-side, and handed to this
 * Client Component together (`seriesByWindow`) -- switching ranges is then
 * an instant local re-render, not a fresh network round trip / page
 * navigation, since `checks`/`checks_aggregated` reads for one project are
 * cheap enough at this app's scale to just prefetch all four up front.
 */
export function ResponseTimeSection({
  seriesByWindow,
}: {
  seriesByWindow: Record<UptimeWindowKey, ResponseTimeSeries>;
}) {
  const [selected, setSelected] = useState<UptimeWindowKey>("24h");

  return (
    <Card className="@container/card">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg">Response time</CardTitle>
        <CardDescription>
          <span className="hidden @[420px]/card:block">
            Showing response time for {RANGE_LABELS[selected]}
          </span>
          <span className="@[420px]/card:hidden">{RANGE_LABELS[selected]}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={selected}
            onValueChange={(value) => value && setSelected(value as UptimeWindowKey)}
            variant="outline"
            className="hidden @[480px]/card:flex"
          >
            {UPTIME_WINDOWS.map((w) => (
              <ToggleGroupItem key={w.key} value={w.key}>
                {w.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select
            value={selected}
            onValueChange={(value) => setSelected(value as UptimeWindowKey)}
          >
            <SelectTrigger
              className="flex w-36 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[480px]/card:hidden"
              size="sm"
              aria-label="Select a range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {UPTIME_WINDOWS.map((w) => (
                <SelectItem key={w.key} value={w.key} className="rounded-lg">
                  {RANGE_LABELS[w.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <ResponseTimeChart series={seriesByWindow[selected]} window={selected} />
      </CardContent>
    </Card>
  );
}
