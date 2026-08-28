"use client";

import Link from "next/link";
import {
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createDataTableColumnHelper } from "@/components/data-table/features";
import { formatDateTime, formatRelativeTime, isExternalUrl } from "@/lib/utils";
import { AddProjectSheet } from "./add-project-sheet";
import { checkTargetPrefix } from "../lib/format";
import type { ManualCheckResult, Project } from "../types";

/** Same badge-color vocabulary as project-list.tsx's card view (#28) --
 * kept in sync manually since the two aren't sharing a component yet (see
 * that file's own comment on the pre-existing, flagged-not-fixed
 * duplication with the dashboard feature's `STATUS_META`). */
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

const columnHelper = createDataTableColumnHelper<Project>();

export type ProjectColumnHandlers = {
  existingCollections: string[];
  pendingId: string | null;
  runningId: string | null;
  runResults: Record<string, ManualCheckResult>;
  runErrors: Record<string, string>;
  onRunCheckNow: (project: Project) => void;
  onToggleActive: (project: Project) => void;
  onEditSuccess: (updated: Project) => void;
  onRequestDelete: (projects: Project[]) => void;
};

/**
 * Column definitions for the projects table view (the table half of the
 * card/table toggle in project-list.tsx). A factory, not a module-level
 * constant, since several columns need per-row mutation handlers/live
 * request state that only exist once `ProjectList` is actually rendering
 * (`onRunCheckNow`, `pendingId`, etc.) -- `ProjectTable` calls this once
 * per render via `useMemo`, keyed on those handlers.
 */
export function createProjectColumns(handlers: ProjectColumnHandlers) {
  const {
    existingCollections,
    pendingId,
    runningId,
    runResults,
    runErrors,
    onRunCheckNow,
    onToggleActive,
    onEditSuccess,
    onRequestDelete,
  } = handlers;

  return columnHelper.columns([
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    }),
    columnHelper.accessor("name", {
      header: "Name",
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/projects/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
      enableHiding: false,
    }),
    columnHelper.display({
      id: "target",
      header: "Target",
      cell: ({ row }) => {
        const project = row.original;
        const prefix = checkTargetPrefix(project.check_type, project.method);
        const canLink = isExternalUrl(project.health_url);
        return (
          <div className="flex max-w-72 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <span className="shrink-0 text-xs font-medium tracking-wide uppercase">
                {prefix}
              </span>
              {canLink ? (
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
            {runErrors[project.id] && (
              <span className="text-xs text-destructive">{runErrors[project.id]}</span>
            )}
            {runResults[project.id] && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Manual check:
                <Badge variant={MANUAL_CHECK_BADGE_VARIANT[runResults[project.id].status]}>
                  {runResults[project.id].status}
                </Badge>
                {runResults[project.id].response_time_ms}ms
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("is_active", {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Paused"}
        </Badge>
      ),
    }),
    columnHelper.accessor("collection", {
      header: "Collection",
      enableSorting: false,
      cell: ({ row }) => row.original.collection || <span className="text-muted-foreground">—</span>,
    }),
    columnHelper.accessor("created_at", {
      header: "Added",
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className="text-muted-foreground"
          title={formatDateTime(row.original.created_at)}
        >
          {formatRelativeTime(row.original.created_at)}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const project = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
              >
                <MoreHorizontal />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                disabled={runningId === project.id}
                onClick={() => onRunCheckNow(project)}
              >
                <RefreshCw className={runningId === project.id ? "animate-spin" : ""} />
                Run check now
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pendingId === project.id}
                onClick={() => onToggleActive(project)}
              >
                {project.is_active ? <PowerOff /> : <Power />}
                {project.is_active ? "Pause monitoring" : "Resume monitoring"}
              </DropdownMenuItem>
              <AddProjectSheet
                trigger={
                  <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                }
                project={project}
                existingCollections={existingCollections}
                onSuccess={onEditSuccess}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onRequestDelete([project])}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false,
      enableHiding: false,
    }),
  ]);
}
