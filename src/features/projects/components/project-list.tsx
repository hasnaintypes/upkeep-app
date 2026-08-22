"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AddProjectForm } from "./add-project-form";
import { deleteProject, setProjectActive } from "../lib/actions";
import type { Project } from "../types";

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
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState(ALL_COLLECTIONS);

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

  async function handleToggleActive(project: Project) {
    setToggleError(null);
    setPendingId(project.id);
    try {
      const { data, error } = await setProjectActive(
        project.id,
        !project.is_active,
      );
      if (error || !data) {
        setToggleError(error ?? "Something went wrong.");
        return;
      }
      setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingProject) return;
    setDeleteError(null);
    setPendingId(deletingProject.id);
    try {
      const { error } = await deleteProject(deletingProject.id);
      if (error) {
        setDeleteError(error);
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== deletingProject.id));
      setDeletingProject(null);
    } finally {
      setPendingId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <Card variant="soft" className="flex flex-col items-center gap-3 p-10 text-center">
        <CardTitle className="text-base">No projects yet</CardTitle>
        <CardDescription>
          Add your first project to start monitoring its health endpoint.
        </CardDescription>
        <Button asChild>
          <Link href="/protected/projects/new">Add project</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {existingCollections.length > 0 && (
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
      )}

      {groups.map(([collectionName, groupProjects]) => (
        <section key={collectionName} className="flex flex-col gap-3">
          {existingCollections.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground">
              {collectionName}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupProjects.map((project) => (
              <Card key={project.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <Badge variant={project.is_active ? "default" : "secondary"}>
                      {project.is_active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  {project.description && (
                    <CardDescription>{project.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="truncate text-sm text-muted-foreground">
                    {project.method} {project.health_url}
                  </p>
                  {(project.hosting_provider || project.tags?.length) && (
                    <div className="flex flex-wrap gap-1">
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
                </CardContent>
                <CardFooter className="justify-end gap-1">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit project"
                    onClick={() => setEditingProject(project)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete project"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingProject(project);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      <Dialog
        open={!!editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>
              Update {editingProject?.name}&apos;s settings.
            </DialogDescription>
          </DialogHeader>
          {editingProject && (
            <AddProjectForm
              project={editingProject}
              existingCollections={existingCollections}
              onCancel={() => setEditingProject(null)}
              onSuccess={(updated) => {
                setProjects((prev) =>
                  prev.map((p) => (p.id === updated.id ? updated : p)),
                );
                setEditingProject(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingProject}
        onOpenChange={(open) => !open && setDeletingProject(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingProject?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all of its check
              history, incidents, and notification rules. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === deletingProject?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingId === deletingProject?.id}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {pendingId === deletingProject?.id ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
