"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, MessageSquarePlus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { updateIncidentCause } from "../lib/actions";
import {
  formatIncidentDateTime,
  formatIncidentDateTimeFull,
  formatIncidentDuration,
} from "../lib/incident-format";
import { LiveIncidentDuration } from "./live-incident-duration";
import type { Incident } from "../types";

/**
 * One incident's status/timing/duration/note row, shared by the per-project
 * history view (`IncidentHistoryTable`, #38) and the global, all-projects
 * view (`GlobalIncidentTable`, #39) -- the two differ only in whether a
 * leading "Project" column is shown (#39 spans multiple projects, #38 is
 * already scoped to one), everything else -- status badge, duration
 * (live-ticking while open), and the inline note editor (#37) -- is
 * identical, so it lives here once instead of twice.
 *
 * Editing renders as an extra full-width row directly below, matching
 * `CheckLogTable`'s response-snippet disclosure row structure -- a "Save"
 * click calls `updateIncidentCause` directly and hands the returned row
 * back up via `onSaved` rather than this component holding any cross-row
 * state.
 */
export function IncidentRow({
  incident,
  onSaved,
  project,
}: {
  incident: Incident;
  onSaved: (updated: Incident) => void;
  /** When provided, renders a leading "Project" cell linking to that
   * project's own detail page (#39's global view only). */
  project?: { id: string; name: string };
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
  const columnCount = project ? 7 : 6;

  return (
    <Fragment>
      <TableRow>
        {project && (
          <TableCell className="font-medium">
            <Link
              href={`/dashboard/projects/${project.id}`}
              className="hover:underline"
            >
              {project.name}
            </Link>
          </TableCell>
        )}
        <TableCell>
          <Badge variant={isOpen ? "destructive" : "outline"}>
            {isOpen ? "Open" : "Resolved"}
          </Badge>
        </TableCell>
        <TableCell
          className="text-muted-foreground"
          title={formatIncidentDateTimeFull(incident.started_at)}
        >
          {formatIncidentDateTime(incident.started_at)}
        </TableCell>
        <TableCell
          className="hidden text-muted-foreground sm:table-cell"
          title={incident.resolved_at ? formatIncidentDateTimeFull(incident.resolved_at) : undefined}
        >
          {incident.resolved_at ? formatIncidentDateTime(incident.resolved_at) : "—"}
        </TableCell>
        <TableCell className="text-muted-foreground tabular-nums">
          {isOpen ? (
            <LiveIncidentDuration startedAt={incident.started_at} />
          ) : (
            formatIncidentDuration(incident.started_at, incident.resolved_at!)
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
          <TableCell colSpan={columnCount} className="py-2">
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
