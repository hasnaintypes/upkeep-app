"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AddProjectForm } from "./add-project-form";
import { ImportSection } from "./import-section";
import type { Project } from "../types";

type AddProjectSheetProps = {
  /** Element that opens the sheet, e.g. a <Button>Add project</Button>. */
  trigger: ReactNode;
  existingCollections?: string[];
  /** When provided, the sheet edits this project instead of creating a new
   * one -- same form/sheet, just pre-filled and re-titled, so "Add project"
   * and "Edit project" share one component instead of an Add sheet plus a
   * separate Edit dialog. */
  project?: Project;
  /**
   * Called with the created/updated project. When omitted, the sheet falls
   * back to `router.refresh()` so server-rendered project lists elsewhere
   * pick up the change.
   */
  onSuccess?: (project: Project) => void;
};

export function AddProjectSheet({
  trigger,
  existingCollections = [],
  project,
  onSuccess,
}: AddProjectSheetProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEditing = !!project;

  function handleSuccess(updated: Project) {
    setOpen(false);
    if (onSuccess) {
      onSuccess(updated);
    } else {
      router.refresh();
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b px-6 py-5">
          <SheetTitle>{isEditing ? "Edit project" : "Add project"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? `Update ${project.name}'s settings.`
              : "Register a project's health endpoint to start monitoring it."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!isEditing && (
            <ImportSection
              onComplete={(created) => {
                if (onSuccess) {
                  created.forEach(onSuccess);
                } else if (created.length > 0) {
                  router.refresh();
                }
              }}
            />
          )}
          <AddProjectForm
            project={project}
            existingCollections={existingCollections}
            onCancel={() => setOpen(false)}
            onSuccess={handleSuccess}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
