"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IncidentRow } from "./incident-row";
import type { Incident, IncidentPage } from "../types";

/** Builds the detail page URL for a given page's cursor -- plain query
 * params (`incidentCursor`/`incidentDir`), distinct from the check log
 * table's own `cursor`/`dir` since both paginated tables share one page
 * URL. Read back by the page's own loader. */
function pageHref(projectId: string, startedAt: string, direction: "next" | "previous"): string {
  const params = new URLSearchParams({ incidentCursor: startedAt, incidentDir: direction });
  return `/dashboard/projects/${projectId}?${params.toString()}`;
}

/**
 * Per-project incident history view (PRD §5.4, Phase 5, #38): every
 * incident for the project, open and resolved, newest-first, keyset-
 * paginated (see `getProjectIncidentsPage`) -- replaces #37's deliberately
 * minimal, unpaginated `IncidentsList`. RLS scoping (`incidents_select_own`)
 * and the note-edit UX are unchanged from #37, just presented as a real
 * table instead of a flat card list. Row rendering itself (status/timing/
 * duration/note editor) is shared with #39's global view -- see
 * `IncidentRow`.
 */
export function IncidentHistoryTable({
  projectId,
  page,
}: {
  projectId: string;
  page: IncidentPage;
}) {
  const [rows, setRows] = useState(page.rows);

  function handleSaved(updated: Incident) {
    setRows((prev) => prev.map((incident) => (incident.id === updated.id ? updated : incident)));
  }

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>Incidents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents recorded yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
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
                  <IncidentRow key={incident.id} incident={incident} onSaved={handleSaved} />
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!page.hasPrevious}
                asChild={page.hasPrevious}
              >
                {page.hasPrevious ? (
                  <Link href={pageHref(projectId, rows[0].started_at, "previous")}>Newer</Link>
                ) : (
                  <span>Newer</span>
                )}
              </Button>
              <Button variant="outline" size="sm" disabled={!page.hasNext} asChild={page.hasNext}>
                {page.hasNext ? (
                  <Link href={pageHref(projectId, rows[rows.length - 1].started_at, "next")}>
                    Older
                  </Link>
                ) : (
                  <span>Older</span>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
