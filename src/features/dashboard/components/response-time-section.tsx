"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UPTIME_WINDOWS } from "../constants";
import type { ResponseTimeSeries, UptimeWindowKey } from "../types";
import { ResponseTimeChart } from "./response-time-chart";

/**
 * Response-time graph section for the per-project detail page (PRD §5.6,
 * Phase 4, #30), with a 24h/7d/30d/90d range switcher matching the overview
 * page's own windows (`UPTIME_WINDOWS`).
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
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
        <CardTitle>Response time</CardTitle>
        <div className="flex flex-wrap gap-1">
          {UPTIME_WINDOWS.map((w) => (
            <Button
              key={w.key}
              size="sm"
              variant={selected === w.key ? "default" : "outline"}
              onClick={() => setSelected(w.key)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <ResponseTimeChart series={seriesByWindow[selected]} window={selected} />
      </CardContent>
    </Card>
  );
}
