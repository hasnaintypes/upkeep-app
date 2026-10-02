import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { CardGridSkeleton } from "@/components/ui/loading-skeletons";
import {
  PlatformAccountList,
  getHostingPlatformsWithTiers,
  getPlatformAccountsWithUsage,
} from "@/features/platform-accounts";

/**
 * Platform account management page (docs/ROADMAP.md Phase 12): create/edit/delete the real
 * hosting accounts a project's usage budget can be pooled against, and see how much of each
 * account's monthly quota is already allocated.
 */
async function PlatformAccountsLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const [{ data: accounts, error: accountsError }, { data: platforms, error: platformsError }] =
    await Promise.all([getPlatformAccountsWithUsage(), getHostingPlatformsWithTiers()]);

  if (accountsError || platformsError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load hosting accounts: {accountsError ?? platformsError}
      </p>
    );
  }

  return <PlatformAccountList initialAccounts={accounts ?? []} platforms={platforms ?? []} />;
}

export default function PlatformAccountsPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Hosting Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Group projects by the real hosting account they run on, and see how much of its
          monthly free-tier usage is already allocated.
        </p>
      </div>
      <Suspense fallback={<CardGridSkeleton count={4} />}>
        <PlatformAccountsLoader />
      </Suspense>
    </div>
  );
}
