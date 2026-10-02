import type { Tables } from "@/lib/supabase/types";

/** A row from the `hosting_platforms` reference catalog (docs/ROADMAP.md Phase 12). Seeded by
 * migration, read-only from the client. */
export type HostingPlatform = Tables<"hosting_platforms">;

/** A row from the `hosting_platform_tiers` reference catalog. Seeded by migration, read-only
 * from the client. */
export type HostingPlatformTier = Tables<"hosting_platform_tiers">;

/** A row from the `platform_accounts` table -- a user's real hosting account, used to pool a
 * shared usage budget across every project attached to it. */
export type PlatformAccount = Tables<"platform_accounts">;

/** A platform, grouped with the tiers available on it, for the create/edit account form's
 * cascading platform -> tier selects. */
export type HostingPlatformWithTiers = HostingPlatform & { tiers: HostingPlatformTier[] };

/**
 * A `platform_accounts` row enriched for display: its platform/tier labels, and the pool
 * accounting (how many minutes/month its attached projects already claim, and how many
 * remain) computed by `getPlatformAccountsWithUsage` (lib/queries.ts). `remaining_minutes_per_month`
 * is null whenever `quota_minutes_per_month` itself is null (unlimited / not budget-tracked) --
 * there's nothing to warn about running out of.
 */
export type PlatformAccountWithUsage = PlatformAccount & {
  platform: Pick<HostingPlatform, "slug" | "name">;
  tier: Pick<HostingPlatformTier, "slug" | "name">;
  project_count: number;
  allocated_minutes_per_month: number;
  remaining_minutes_per_month: number | null;
};

/** Common shape returned by the account actions in lib/actions.ts, mirroring
 * `ProjectActionResult` (features/projects/types/index.ts). */
export type PlatformAccountActionResult = {
  data: PlatformAccount | null;
  error: string | null;
};
