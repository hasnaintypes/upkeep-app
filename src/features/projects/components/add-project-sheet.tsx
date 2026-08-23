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
import type { Project } from "../types";

type AddProjectSheetProps = {
  /** Element that opens the sheet, e.g. a <Button>Add project</Button>. */
  trigger: ReactNode;
  existingCollections?: string[];
  /**
   * Called with the created project. When omitted, the sheet falls back to
   * `router.refresh()` so server-rendered project lists elsewhere pick up
   * the new row.
   */
  onSuccess?: (project: Project) => void;
};

export function AddProjectSheet({
  trigger,
  existingCollections = [],
  onSuccess,
}: AddProjectSheetProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b px-6 py-5">
          <SheetTitle>Add project</SheetTitle>
          <SheetDescription>
            Register a project&apos;s health endpoint to start monitoring it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AddProjectForm
            existingCollections={existingCollections}
            onCancel={() => setOpen(false)}
            onSuccess={(project) => {
              setOpen(false);
              if (onSuccess) {
                onSuccess(project);
              } else {
                router.refresh();
              }
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
