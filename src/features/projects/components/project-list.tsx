"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FolderIcon,
  LayoutGridIcon,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  TableIcon,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { notify } from "@/lib/toast";
import { isExternalUrl } from "@/lib/utils";
import { AddProjectSheet } from "./add-project-sheet";
import { ProjectTable } from "./project-table";
import { deleteProject, setProjectActive } from "../lib/actions";
import { checkTargetPrefix } from "../lib/format";
import { runProjectCheckNow } from "../lib/run-check";
import type { ManualCheckResult, Project } from "../types";

type ProjectView = "cards" | "table";

/** Badge color per manual-check status (#28) -- mirrors the same up/down/
 * degraded/waking/unknown vocabulary the prober's classifier uses
 * (supabase/functions/prober/classify.ts), shown here only ephemerally
 * (this component's own state, not persisted UI) right after a user
 * triggers a check. */
const MANUAL_CHECK_BADGE_VARIANT: Record<
  ManualCheckResult["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  up: "default",
  degraded: "secondary",
  waking: "secondary",
  down: "destructive",
  unknown: "outline",
};

const UNCATEGORIZED = "Uncategorized";
const ALL_COLLECTIONS = "__all__";

/**
 * Renders the current user's projects and their edit/deactivate/delete
 * actions. `initialProjects` comes from a server-side fetch (RLS-scoped --
 * see features/projects/lib/queries.ts); every mutation below updates local
 * state directly from the server action's returned row, so the list reflects
 * changes immediately without a full page reload or re-fetch.
 *
 * Projects are grouped by `collection` (PRD §5.1 "folders"), with a filter to
 * narrow down to one collection. Projects without a collection are grouped
 * under "Uncategorized", shown last.
 */
export function ProjectList({
  initialProjects,
}: {
  initialProjects: Project[];
}) {
  const [projects, setProjects] = useState(initialProjects);

  // Keep local state in sync when the server-fetched list changes underneath
  // us (e.g. `router.refresh()` after creating a project from a sheet that
  // isn't this component, such as the sidebar or page-header trigger).
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // A plain array, not a single `Project | null` -- shared by both the
  // single-row "Delete" action (table/card views) and the table view's
  // bulk "Delete selected" toolbar button, so there's one confirmation
  // dialog/one `handleConfirmDelete` implementation for both instead of
  // two near-duplicate code paths.
  const [deleteTargets, setDeleteTargets] = useState<Project[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState(ALL_COLLECTIONS);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, ManualCheckResult>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [view, setView] = useState<ProjectView>("table");
  const [bulkPending, setBulkPending] = useState(false);

  const existingCollections = useMemo(
    () =>
      Array.from(
        new Set(
          projects
            .map((p) => p.collection)
            .filter((c): c is string => !!c && c.trim().length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const groups = useMemo(() => {
    const filtered =
      collectionFilter === ALL_COLLECTIONS
        ? projects
        : projects.filter((p) => (p.collection || UNCATEGORIZED) === collectionFilter);

    const byCollection = new Map<string, Project[]>();
    for (const project of filtered) {
      const key = project.collection?.trim() || UNCATEGORIZED;
      byCollection.set(key, [...(byCollection.get(key) ?? []), project]);
    }

    return Array.from(byCollection.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [projects, collectionFilter]);

  // Same filter predicate `groups` applies before grouping into sections --
  // the table view has no per-collection sections of its own (the
  // Collection select above already narrows it), so it just needs the
  // flat, filtered list.
  const flatFilteredProjects = useMemo(
    () =>
      collectionFilter === ALL_COLLECTIONS
        ? projects
        : projects.filter((p) => (p.collection || UNCATEGORIZED) === collectionFilter),
    [projects, collectionFilter],
  );

  async function handleToggleActive(project: Project) {
    setToggleError(null);
    setPendingId(project.id);
    try {
      const { data, error } = await setProjectActive(
        project.id,
        !project.is_active,
      );
      if (error || !data) {
        const message = error ?? "Something went wrong.";
        setToggleError(message);
        notify.error("Couldn't update project", message);
        return;
      }
      setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      notify.success(data.is_active ? "Monitoring resumed" : "Monitoring paused", data.name);
    } finally {
      setPendingId(null);
    }
  }

  /**
   * Runs an immediate health check for one project (#28), via the Server
   * Action in lib/run-check.ts. `runningId` disables just that project's
   * button (same `pendingId`-per-row pattern as handleToggleActive) so
   * triggering one project's check can't be mistaken for another's, and
   * the result/error is shown inline on that project's card right away --
   * no page reload or re-fetch needed, matching every other mutation here.
   */
  async function handleRunCheckNow(project: Project) {
    setRunningId(project.id);
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[project.id];
      return next;
    });
    try {
      const { data, error } = await runProjectCheckNow(project.id);
      if (error || !data) {
        const message = error ?? "Something went wrong.";
        setRunErrors((prev) => ({ ...prev, [project.id]: message }));
        notify.error(`Check failed for ${project.name}`, message);
        return;
      }
      setRunResults((prev) => ({ ...prev, [project.id]: data }));
      const detail = `${data.response_time_ms}ms${data.http_status != null ? ` · HTTP ${data.http_status}` : ""}`;
      if (data.status === "up") {
        notify.success(`${project.name}: up`, detail);
      } else if (data.status === "down") {
        notify.error(`${project.name}: down`, detail);
      } else if (data.status === "degraded" || data.status === "waking") {
        notify.warning(`${project.name}: ${data.status}`, detail);
      } else {
        notify.info(`${project.name}: unknown`, detail);
      }
    } finally {
      setRunningId(null);
    }
  }

  /**
   * Deletes every project in `deleteTargets` (one for a single-row delete,
   * several for the table view's bulk "Delete selected") concurrently --
   * mirrors the existing single-delete UX (optimistic local-state removal,
   * a toast) but aggregates errors instead of stopping at the first one,
   * so one project's RLS/network hiccup can't silently hide whether the
   * others succeeded.
   */
  async function handleConfirmDelete() {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setDeleteError(null);
    setPendingId(deleteTargets[0].id);
    try {
      const results = await Promise.all(
        deleteTargets.map(async (project) => ({
          project,
          error: (await deleteProject(project.id)).error,
        })),
      );
      const failed = results.filter((r) => r.error);
      const succeededIds = new Set(
        results.filter((r) => !r.error).map((r) => r.project.id),
      );

      if (succeededIds.size > 0) {
        setProjects((prev) => prev.filter((p) => !succeededIds.has(p.id)));
      }

      if (failed.length > 0) {
        const message =
          failed.length === 1
            ? failed[0].error!
            : `${failed.length} of ${deleteTargets.length} projects couldn't be deleted.`;
        setDeleteError(message);
        notify.error("Couldn't delete all selected projects", message);
        // Leaves the dialog open, now only listing what's still left to
        // delete, so the user can retry just the failures.
        setDeleteTargets(failed.map((r) => r.project));
        return;
      }

      notify.success(
        deleteTargets.length === 1
          ? `${deleteTargets[0].name} deleted`
          : `${deleteTargets.length} projects deleted`,
      );
      setDeleteTargets(null);
    } finally {
      setPendingId(null);
    }
  }

  /**
   * Pauses/resumes every project in `targets` concurrently (the table
   * view's bulk "Pause"/"Resume" toolbar buttons -- there's no per-row
   * confirmation needed here, unlike delete, since it's reversible). Runs
   * through the exact same `setProjectActive` action as the single-project
   * toggle above, just fanned out.
   */
  async function handleBulkSetActive(targets: Project[], isActive: boolean) {
    if (targets.length === 0) return;
    setBulkPending(true);
    try {
      const results = await Promise.all(
        targets.map((project) => setProjectActive(project.id, isActive)),
      );
      const updatedById = new Map(
        results.filter((r) => r.data).map((r) => [r.data!.id, r.data!]),
      );
      if (updatedById.size > 0) {
        setProjects((prev) => prev.map((p) => updatedById.get(p.id) ?? p));
      }
      const failedCount = results.length - updatedById.size;
      if (failedCount > 0) {
        notify.error(
          `${failedCount} of ${targets.length} projects couldn't be updated`,
        );
      } else {
        notify.success(
          isActive
            ? `${targets.length} project(s) resumed`
            : `${targets.length} project(s) paused`,
        );
      }
    } finally {
      setBulkPending(false);
    }
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderIcon}
        title="No projects yet"
        description="Add your first project to start monitoring its health endpoint."
        action={
          <AddProjectSheet
            trigger={<Button>Add project</Button>}
            existingCollections={existingCollections}
            onSuccess={(created) => setProjects((prev) => [created, ...prev])}
          />
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {existingCollections.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Collection</span>
            <Select value={collectionFilter} onValueChange={setCollectionFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COLLECTIONS}>All collections</SelectItem>
                {existingCollections.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
                <SelectItem value={UNCATEGORIZED}>{UNCATEGORIZED}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div />
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(value) => value && setView(value as ProjectView)}
        >
          <ToggleGroupItem value="cards" aria-label="Card view">
            <LayoutGridIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <TableIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "table" ? (
        <ProjectTable
          projects={flatFilteredProjects}
          existingCollections={existingCollections}
          pendingId={pendingId}
          runningId={runningId}
          runResults={runResults}
          runErrors={runErrors}
          onRunCheckNow={handleRunCheckNow}
          onToggleActive={handleToggleActive}
          onEditSuccess={(updated) =>
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          }
          onRequestDelete={(targets) => {
            setDeleteError(null);
            setDeleteTargets(targets);
          }}
          onBulkSetActive={handleBulkSetActive}
          bulkPending={bulkPending}
        />
      ) : (
        groups.map(([collectionName, groupProjects]) => (
          <section key={collectionName} className="flex flex-col gap-3">
          {existingCollections.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground">
              {collectionName}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupProjects.map((project) => (
              <Card key={project.id} className="gap-4 transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      <Link href={`/dashboard/projects/${project.id}`} className="hover:underline">
                        {project.name}
                      </Link>
                    </CardTitle>
                    <Badge variant={project.is_active ? "default" : "secondary"} className="shrink-0">
                      {project.is_active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="shrink-0 text-xs font-medium tracking-wide uppercase">
                      {checkTargetPrefix(project.check_type, project.method)}
                    </span>
                    {isExternalUrl(project.health_url) ? (
                      <a
                        href={project.health_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={project.health_url}
                        className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground hover:underline"
                      >
                        <span className="truncate">Health URL</span>
                        <ExternalLink className="size-3.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate" title={project.health_url}>
                        {project.health_url}
                      </span>
                    )}
                  </div>
                  {(project.hosting_provider || project.tags?.length) && (
                    <div className="flex flex-wrap gap-1.5">
                      {project.hosting_provider && (
                        <Badge variant="outline">{project.hosting_provider}</Badge>
                      )}
                      {project.tags?.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {runErrors[project.id] && (
                    <p className="text-xs text-destructive">{runErrors[project.id]}</p>
                  )}
                  {runResults[project.id] && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Manual check:
                      <Badge variant={MANUAL_CHECK_BADGE_VARIANT[runResults[project.id].status]}>
                        {runResults[project.id].status}
                      </Badge>
                      {runResults[project.id].response_time_ms}ms
                      {runResults[project.id].http_status != null &&
                        ` · HTTP ${runResults[project.id].http_status}`}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="justify-end gap-1 border-t">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Run check now"
                    disabled={runningId === project.id}
                    onClick={() => handleRunCheckNow(project)}
                  >
                    <RefreshCw
                      className={`size-4 ${runningId === project.id ? "animate-spin" : ""}`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      project.is_active ? "Pause monitoring" : "Resume monitoring"
                    }
                    disabled={pendingId === project.id}
                    onClick={() => handleToggleActive(project)}
                  >
                    {project.is_active ? (
                      <PowerOff className="size-4" />
                    ) : (
                      <Power className="size-4" />
                    )}
                  </Button>
                  <AddProjectSheet
                    trigger={
                      <Button variant="ghost" size="icon" aria-label="Edit project">
                        <Pencil className="size-4" />
                      </Button>
                    }
                    project={project}
                    existingCollections={existingCollections}
                    onSuccess={(updated) =>
                      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete project"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTargets([project]);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      ))
      )}

      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      <AlertDialog
        open={!!deleteTargets}
        onOpenChange={(open) => !open && setDeleteTargets(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTargets?.length === 1
                ? `Delete ${deleteTargets[0].name}?`
                : `Delete ${deleteTargets?.length ?? 0} projects?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              {deleteTargets?.length === 1 ? "the project" : "these projects"}{" "}
              and all of its check history, incidents, and notification
              rules. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === deleteTargets?.[0]?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingId === deleteTargets?.[0]?.id}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {pendingId === deleteTargets?.[0]?.id ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
