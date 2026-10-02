import { createClient } from "@/lib/supabase/server";
import type { HostingPlatformWithTiers, PlatformAccountWithUsage } from "../types";

/**
 * Lists every hosting platform with its tiers, for the create/edit account form's cascading
 * platform -> tier selects. Reference data (no RLS ownership filter -- `hosting_platforms_select_all`
 * / `hosting_platform_tiers_select_all` allow any authenticated user to read the whole catalog).
 */
export async function getHostingPlatformsWithTiers(): Promise<{
  data: HostingPlatformWithTiers[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hosting_platforms")
    .select("*, tiers:hosting_platform_tiers(*)")
    .order("name", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Lists the current user's platform accounts with pool-accounting computed in: how many
 * minutes/month their attached projects already claim, and how many of the account's quota
 * remain. Relies entirely on `platform_accounts_select_own` for ownership scoping, same
 * convention as features/projects/lib/queries.ts's `getProjects` -- the embedded `projects(...)`
 * rows are implicitly scoped to the same owner too (a project's own RLS would hide anyone
 * else's row even if the embed somehow weren't already account-scoped).
 *
 * Allocation only counts a project's `keep_alive_budget_minutes_per_month` while
 * `keep_alive_enabled` is actually on (an allocation left over from toggling keep-alive off
 * doesn't currently cost anything) -- confirmed decision for Phase 12: keep-alive budget counts
 * toward the pool, but only while it's actually running.
 */
export async function getPlatformAccountsWithUsage(): Promise<{
  data: PlatformAccountWithUsage[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_accounts")
    .select(
      "*, hosting_platforms(slug, name), hosting_platform_tiers(slug, name), projects(budget_minutes_per_month, keep_alive_budget_minutes_per_month, keep_alive_enabled)",
    )
    .order("label", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const withUsage: PlatformAccountWithUsage[] = data.map((account) => {
    const { hosting_platforms, hosting_platform_tiers, projects, ...rest } = account;
    const allocatedMinutesPerMonth = projects.reduce((sum, project) => {
      const monitoring = project.budget_minutes_per_month ?? 0;
      const keepAlive = project.keep_alive_enabled
        ? project.keep_alive_budget_minutes_per_month ?? 0
        : 0;
      return sum + monitoring + keepAlive;
    }, 0);

    return {
      ...rest,
      platform: hosting_platforms,
      tier: hosting_platform_tiers,
      project_count: projects.length,
      allocated_minutes_per_month: allocatedMinutesPerMonth,
      remaining_minutes_per_month:
        rest.quota_minutes_per_month === null
          ? null
          : rest.quota_minutes_per_month - allocatedMinutesPerMonth,
    };
  });

  return { data: withUsage, error: null };
}
