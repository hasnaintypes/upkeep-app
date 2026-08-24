"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MessageSquarePlus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { updateIncidentCause } from "../lib/actions";
import { INCIDENT_LIVE_DURATION_TICK_MS } from "../constants";
import type { Incident, IncidentPage } from "../types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2h 15m"-style duration, coarsest-two-units only (matches
 * `formatRelativeTime`'s own compactness, lib/utils.ts). Takes an explicit
 * end instant rather than always reading `Date.now()` internally, so the
 * same function covers both a resolved incident's fixed `resolved_at` and
 * an open incident's live, ticking "now" (see `LiveDuration` below). */
function formatDuration(startedAt: string, end: Date | string): string {
  const endMs = typeof end === "string" ? new Date(end).getTime() : end.getTime();
  const elapsedMs = Math.max(0, endMs - new Date(startedAt).getTime());
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

/** Forces a re-render every `intervalMs` -- the only way an open incident's
 * duration keeps advancing without a full page reload/refetch. No ticking-
 * clock precedent exists elsewhere in this codebase; scoped locally here
 * (and to just the one small cell that needs it, via `LiveDuration` below)
 * rather than re-rendering the whole table on every tick. */
function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

/** Live "how long has this been going on" duration for a still-open
 * incident (PRD §5.4, Phase 5, #38's "now - start, relative/live"
 * acceptance criterion) -- a resolved incident's duration is fixed and
 * doesn't need this, see the plain `formatDuration` call at the call site. */
function LiveDuration({ startedAt }: { startedAt: string }) {
  useTick(INCIDENT_LIVE_DURATION_TICK_MS);
  return <>{formatDuration(startedAt, new Date())}</>;
}

/** Builds the detail page URL for a given page's cursor -- plain query
 * params (`incidentCursor`/`incidentDir`), distinct from the check log
 * table's own `cursor`/`dir` since both paginated tables share one page
 * URL. Read back by the page's own loader. */
function pageHref(projectId: string, startedAt: string, direction: "next" | "previous"): string {
  const params = new URLSearchParams({ incidentCursor: startedAt, incidentDir: direction });
  return `/dashboard/projects/${projectId}?${params.toString()}`;
}

/**
 * One incident's status/timing/duration row plus its editable note (#37's
 * own scope -- open/resolved timing itself is #35/#36's prober-side logic,
 * read-only here). Editing renders as an extra full-width row directly
 * below, matching `CheckLogTable`'s response-snippet disclosure row
 * structure -- a "Save" click calls `updateIncidentCause` directly and
 * hands the returned row back up via `onSaved` rather than this component
 * holding any cross-row state.
 */
function IncidentRow({
  incident,
  onSaved,
}: {
  incident: Incident;
  onSaved: (updated: Incident) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(incident.cause ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setDraft(incident.cause ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const { data, error } = await updateIncidentCause(incident.id, draft);
      if (error || !data) {
        setError(error ?? "Something went wrong.");
        return;
      }
      onSaved(data);
      setEditing(false);
    });
  }

  const isOpen = incident.resolved_at === null;

  return (
    <Fragment>
      <TableRow>
        <TableCell>
          <Badge variant={isOpen ? "destructive" : "outline"}>
            {isOpen ? "Open" : "Resolved"}
          </Badge>
        </TableCell>
        <TableCell
          className="text-muted-foreground"
          title={new Date(incident.started_at).toLocaleString()}
        >
          {formatDateTime(incident.started_at)}
        </TableCell>
        <TableCell
          className="hidden text-muted-foreground sm:table-cell"
          title={incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : undefined}
        >
          {incident.resolved_at ? formatDateTime(incident.resolved_at) : "—"}
        </TableCell>
        <TableCell className="text-muted-foreground tabular-nums">
          {isOpen ? (
            <LiveDuration startedAt={incident.started_at} />
          ) : (
            formatDuration(incident.started_at, incident.resolved_at!)
          )}
        </TableCell>
        <TableCell className="max-w-48 truncate text-muted-foreground sm:max-w-80">
          {incident.cause ?? <span className="italic">No note</span>}
        </TableCell>
        <TableCell className="text-right">
          <Button type="button" size="sm" variant="ghost" onClick={startEditing} disabled={editing}>
            {incident.cause ? (
              <Pencil className="size-3.5" />
            ) : (
              <MessageSquarePlus className="size-3.5" />
            )}
            <span className="hidden sm:inline">{incident.cause ? "Edit" : "Add note"}</span>
          </Button>
        </TableCell>
      </TableRow>
      {editing && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="py-2">
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder='e.g. "host maintenance" or "my bug, fixed in commit abc123"'
                disabled={isPending}
                aria-label="Incident note"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={save} disabled={isPending}>
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

/**
 * Per-project incident history view (PRD §5.4, Phase 5, #38): every
 * incident for the project, open and resolved, newest-first, keyset-
 * paginated (see `getProjectIncidentsPage`) -- replaces #37's deliberately
 * minimal, unpaginated `IncidentsList`. RLS scoping (`incidents_select_own`)
 * and the note-edit UX are unchanged from #37, just presented as a real
 * table instead of a flat card list.
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
