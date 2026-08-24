"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquarePlus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateIncidentCause } from "../lib/actions";
import type { Incident } from "../types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2h 15m"-style duration, coarsest-two-units only (matches
 * `formatRelativeTime`'s own compactness, lib/utils.ts) -- an incident
 * list entry needs "how long did this last", not down-to-the-second
 * precision. */
function formatDuration(startedAt: string, resolvedAt: string): string {
  const elapsedMs = Math.max(
    0,
    new Date(resolvedAt).getTime() - new Date(startedAt).getTime(),
  );
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

/**
 * One incident's status/timing summary plus its editable note (#37's own
 * scope -- open/resolved timing itself is #35/#36's prober-side logic,
 * read-only here). Editing is local to this row: a "Save" click calls
 * `updateIncidentCause` directly and hands the returned row back up via
 * `onSaved` rather than this component holding any cross-row state.
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
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={isOpen ? "destructive" : "outline"}>
          {isOpen ? "Open" : "Resolved"}
        </Badge>
        <span
          className="text-sm text-muted-foreground"
          title={new Date(incident.started_at).toLocaleString()}
        >
          Started {formatDateTime(incident.started_at)}
        </span>
        {incident.resolved_at && (
          <span className="text-sm text-muted-foreground">
            · Lasted {formatDuration(incident.started_at, incident.resolved_at)}
          </span>
        )}
      </div>

      {editing ? (
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
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {incident.cause ?? <span className="italic">No note added.</span>}
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={startEditing}>
            {incident.cause ? (
              <Pencil className="size-3.5" />
            ) : (
              <MessageSquarePlus className="size-3.5" />
            )}
            {incident.cause ? "Edit" : "Add note"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Per-project incident list (PRD §5.6/§5.4, Phase 5, #37) -- deliberately
 * basic (flat, capped list -- see INCIDENT_LIST_LIMIT -- no pagination or
 * filtering) since a real incident history view is #38's own scope; this
 * exists so #37's manual-annotation feature has an incident to attach a
 * note to in the dashboard, not just a Server Action with no UI. Each
 * row's note editor calls `updateIncidentCause` directly and merges the
 * returned row back into local state -- same "update from the server
 * action's own response, no full re-fetch" convention as `ProjectList`
 * (features/projects/components/project-list.tsx).
 */
export function IncidentsList({ initialIncidents }: { initialIncidents: Incident[] }) {
  const [incidents, setIncidents] = useState(initialIncidents);

  function handleSaved(updated: Incident) {
    setIncidents((prev) => prev.map((incident) => (incident.id === updated.id ? updated : incident)));
  }

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>Incidents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 sm:px-6">
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents recorded yet.</p>
        ) : (
          incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} onSaved={handleSaved} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
