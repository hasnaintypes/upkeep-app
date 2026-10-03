"use client";

import type { ReactNode } from "react";
import { useSettingsDialog } from "@/components/layout/settings-dialog";

/**
 * Opens the settings dialog's Hosting Accounts section -- the one interactive bit of
 * `ProjectDetailHeader`'s "Hosting budget" detail row, split into its own Client Component
 * since `useSettingsDialog()` needs client context and `ProjectDetailHeader` itself is
 * deliberately a plain Server Component (see that file's own doc comment).
 */
export function HostingBudgetLink({ children }: { children: ReactNode }) {
  const openSettings = useSettingsDialog();
  return (
    <button type="button" onClick={() => openSettings("hosting")} className="hover:underline">
      {children}
    </button>
  );
}
