"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Groups the per-project detail page's two history views (incidents, raw
 * check log) into one tabbed section instead of two always-stacked full-
 * width cards -- the redesign's "glance vs. dig in" split: `ResponseTimeSection`
 * and `UptimeHeatmap` above stay full-width (they're the at-a-glance
 * layer), while these two detail-heavy, independently-paginated tables only
 * need to be on screen one at a time.
 *
 * `incidents`/`checkLog` are pre-rendered Server Components passed down
 * from the page loader, not imported here -- this file is a Client
 * Component (for `Tabs`' open-tab state) and Server Components can only
 * cross that boundary as already-rendered children, not as imports.
 */
export function ProjectHistoryTabs({
  incidents,
  checkLog,
}: {
  incidents: ReactNode;
  checkLog: ReactNode;
}) {
  return (
    <Tabs defaultValue="incidents">
      <TabsList>
        <TabsTrigger value="incidents">Incidents</TabsTrigger>
        <TabsTrigger value="checks">Check log</TabsTrigger>
      </TabsList>
      <TabsContent value="incidents">{incidents}</TabsContent>
      <TabsContent value="checks">{checkLog}</TabsContent>
    </Tabs>
  );
}
