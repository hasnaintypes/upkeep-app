"use client";

import { useState } from "react";
import Link from "next/link";
import { SirenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IncidentRow } from "./incident-row";
import type { GlobalIncidentFilters, GlobalIncidentPage, Incident } from "../types";

/** Builds the incidents page URL for a given page's cursor, preserving
 * every active filter (a cursor is only meaningful relative to the exact
 * filtered result set it came from). Distinct query param names from the
 * per-project view's `incidentCursor`/`incidentDir` since this is its own
 * dedicated route (`/dashboard/incidents`), not a shared page URL. */
function pageHref(
  filters: GlobalIncidentFilters,
  startedAt: string,
  direction: "next" | "previous",
): string {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.status) params.set("status", filters.status);
  if (filters.since) params.set("since", filters.since);
  params.set("cursor", startedAt);
  params.set("dir", direction);
  return `/dashboard/incidents?${params.toString()}`;
}

/**
 * Global, all-projects incident history view (PRD §5.4, Phase 5, #39):
 * every incident across every project the signed-in user owns, newest-
 * first, keyset-paginated (see `getIncidentsPage`) and filterable by
 * project/status/time-range (see `IncidentFilterBar`). Row rendering
 * (status/timing/duration/note editor) is shared with #38's per-project
 * view -- see `IncidentRow` -- with its `project` prop supplied here so
 * each row also shows/links to which project it belongs to.
 */
export function GlobalIncidentTable({
  page,
  filters,
}: {
  page: GlobalIncidentPage;
  filters: GlobalIncidentFilters;
}) {
  const [rows, setRows] = useState(page.rows);

  function handleSaved(updated: Incident) {
    setRows((prev) =>
      prev.map((incident) =>
        incident.id === updated.id ? { ...incident, ...updated } : incident,
      ),
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SirenIcon}
        title="No incidents found"
        description="Nothing matches your current filters, or you have no incident history yet."
      />
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="hidden sm:table-cell">Resolved</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                onSaved={handleSaved}
                project={{ id: incident.project_id, name: incident.project_name }}
              />
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!page.hasPrevious} asChild={page.hasPrevious}>
            {page.hasPrevious ? (
              <Link href={pageHref(filters, rows[0].started_at, "previous")}>Newer</Link>
            ) : (
              <span>Newer</span>
            )}
          </Button>
          <Button variant="outline" size="sm" disabled={!page.hasNext} asChild={page.hasNext}>
            {page.hasNext ? (
              <Link href={pageHref(filters, rows[rows.length - 1].started_at, "next")}>Older</Link>
            ) : (
              <span>Older</span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
