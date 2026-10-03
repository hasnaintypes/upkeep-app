"use client";

import { useState } from "react";
import { Plus, ServerIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InlineEmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { notify } from "@/lib/toast";
import { deletePlatformAccount } from "../lib/actions";
import { PlatformAccountForm } from "./platform-account-form";
import type { HostingPlatformWithTiers, PlatformAccount, PlatformAccountWithUsage } from "../types";

/**
 * Hosting account management (docs/ROADMAP.md Phase 12): create/edit/delete the real hosting
 * accounts a project's usage budget can be pooled against. Rendered in the Hosting Accounts
 * section of the settings dialog (components/layout/settings-dialog.tsx) -- the underlying
 * feature/table names stay "platform account[s]", see this feature's own index.ts for why.
 * Owns state/mutations and delegates create/edit to `PlatformAccountForm` inside a `Sheet`
 * (same side-panel convention as `AddProjectSheet`, nested inside the settings `Dialog` --
 * Radix supports this) -- same parent-owns-mutations split as `ApiKeyList`/`ChannelList`; the
 * delete `AlertDialog` mirrors those same two features' confirmation flow.
 */
export function PlatformAccountList({
  initialAccounts,
  platforms,
}: {
  initialAccounts: PlatformAccountWithUsage[];
  platforms: HostingPlatformWithTiers[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PlatformAccountWithUsage | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<PlatformAccountWithUsage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * `createPlatformAccount`/`updatePlatformAccount` only ever return a plain `PlatformAccount`
   * row (no joined platform/tier labels, no usage numbers) -- editing an existing card reuses
   * its already-known usage fields as-is (they can't have changed from this save: only
   * `assumed_ms_per_request` changing could shift a *project's* derived interval, never this
   * account's own allocation total), while adding a new one starts at zero usage (a freshly
   * created account has no attached projects yet) with its platform/tier labels looked up from
   * the `platforms` prop already in hand.
   */
  function handleSaved(saved: PlatformAccount) {
    setAccounts((prev) => {
      const existing = prev.find((a) => a.id === saved.id);
      if (existing) {
        return prev.map((a) => (a.id === saved.id ? { ...a, ...saved } : a));
      }
      const platform = platforms.find((p) => p.id === saved.platform_id);
      const tier = platform?.tiers.find((t) => t.id === saved.tier_id);
      return [
        ...prev,
        {
          ...saved,
          platform: platform ? { slug: platform.slug, name: platform.name } : { slug: "", name: "" },
          tier: tier ? { slug: tier.slug, name: tier.name } : { slug: "", name: "" },
          project_count: 0,
          allocated_minutes_per_month: 0,
          remaining_minutes_per_month: saved.quota_minutes_per_month,
        },
      ].sort((a, b) => a.label.localeCompare(b.label));
    });
    setFormOpen(false);
    setEditingAccount(null);
  }

  async function handleConfirmDelete() {
    if (!deletingAccount) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const { error } = await deletePlatformAccount(deletingAccount.id);
      if (error) {
        setDeleteError(error);
        notify.error("Couldn't delete account", error);
        return;
      }
      setAccounts((prev) => prev.filter((a) => a.id !== deletingAccount.id));
      notify.success("Account deleted");
      setDeletingAccount(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {accounts.length === 0
            ? "No accounts yet"
            : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditingAccount(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> New hosting account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <InlineEmptyState
          icon={ServerIcon}
          title="No hosting accounts yet"
          description="Add one to let Upkeep derive a project's check interval from a monthly usage budget instead of guessing a number."
        />
      ) : (
        <div className="divide-y">
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-3 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{account.label}</p>
                    <Badge variant="secondary">{account.platform.name}</Badge>
                    <Badge variant="outline">{account.tier.name}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.project_count} project{account.project_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingAccount(account);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingAccount(account);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {account.quota_minutes_per_month === null ? (
                <p className="text-sm text-muted-foreground">
                  {account.allocated_minutes_per_month} min/month allocated · unlimited quota
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Progress
                    value={Math.min(
                      100,
                      (account.allocated_minutes_per_month / Math.max(account.quota_minutes_per_month, 1)) * 100,
                    )}
                    className={
                      (account.remaining_minutes_per_month ?? 0) < 0
                        ? "[&_[data-slot=progress-indicator]]:bg-destructive"
                        : undefined
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    {account.allocated_minutes_per_month} / {account.quota_minutes_per_month} min/month
                    allocated
                    {(account.remaining_minutes_per_month ?? 0) < 0 && (
                      <span className="text-destructive"> -- over budget (estimate)</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAccount(null);
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="gap-1 border-b px-6 py-5">
            <SheetTitle>{editingAccount ? "Edit hosting account" : "New hosting account"}</SheetTitle>
            <SheetDescription>
              {editingAccount
                ? `Update ${editingAccount.label}'s platform, tier, and budget defaults.`
                : "Pick a platform and tier to pre-fill its known free quota, or enter your own."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
            <PlatformAccountForm
              platforms={platforms}
              account={editingAccount ?? undefined}
              onSuccess={handleSaved}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingAccount} onOpenChange={(open) => !open && setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deletingAccount?.label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAccount && deletingAccount.project_count > 0
                ? `${deletingAccount.project_count} attached project${deletingAccount.project_count === 1 ? "" : "s"} will switch back to a manually-set check interval -- they won't be deleted.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
