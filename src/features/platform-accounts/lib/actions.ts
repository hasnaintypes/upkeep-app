"use server";

import { createClient } from "@/lib/supabase/server";
import { intervalSecondsFromBudget, keepAliveIntervalMinutesFromBudget } from "./platform-budget";
import { getPlatformAccountsWithUsage } from "./queries";
import type { PlatformAccountActionResult, PlatformAccountWithUsage } from "../types";
import { platformAccountSchema, type PlatformAccountFormValues } from "./validation";

/**
 * Server actions for platform account CRUD (docs/ROADMAP.md Phase 12), mirroring the typed-
 * result pattern in features/projects/lib/actions.ts. None of these filter by `user_id`:
 * ownership is enforced entirely by `platform_accounts`'s RLS policies.
 */

/**
 * Creates a platform account. `quota_minutes_per_month` defaults to the chosen tier's own
 * preset when the caller doesn't override it (the create form pre-fills this client-side from
 * the same tier data, but re-derives it here too in case a caller skips that) -- `undefined`
 * means "use the tier's preset," while an explicit `null` means "no quota, don't track."
 */
export async function createPlatformAccount(
  input: PlatformAccountFormValues & { quota_minutes_per_month?: number | null },
): Promise<PlatformAccountActionResult> {
  const result = platformAccountSchema.safeParse(input);
  if (!result.success) {
    return { data: null, error: result.error.issues[0]?.message ?? "Invalid account." };
  }

  const supabase = await createClient();

  let quota = result.data.quota_minutes_per_month;
  if (input.quota_minutes_per_month === undefined) {
    const { data: tier } = await supabase
      .from("hosting_platform_tiers")
      .select("free_quota_minutes_per_month")
      .eq("id", result.data.tier_id)
      .single();
    quota = tier?.free_quota_minutes_per_month ?? null;
  }

  const { data, error } = await supabase
    .from("platform_accounts")
    .insert({ ...result.data, quota_minutes_per_month: quota })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

type UpdatePlatformAccountInput = Partial<PlatformAccountFormValues>;

/**
 * Updates a platform account. If `assumed_ms_per_request` changes, every attached project's
 * derived `check_interval_seconds`/`keep_alive_interval_minutes` is recomputed against the new
 * value (a project's own `budget_minutes_per_month` is unchanged, so the previous derived
 * interval is now stale) -- `quota_minutes_per_month` changing does NOT trigger this, since the
 * per-project math only ever depends on that project's own budget + this account's
 * assumed-ms-per-request, never the pool total. Sequential per-row updates, not wrapped in a
 * single DB transaction -- acceptable for this low-frequency, user-initiated settings change
 * (docs/ROADMAP.md Phase 12's own stated simplification).
 */
export async function updatePlatformAccount(
  id: string,
  input: UpdatePlatformAccountInput,
): Promise<PlatformAccountActionResult> {
  const result = platformAccountSchema.partial().safeParse(input);
  if (!result.success) {
    return { data: null, error: result.error.issues[0]?.message ?? "Invalid account." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_accounts")
    .update(result.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Platform account not found." };
    }
    return { data: null, error: error.message };
  }

  if (result.data.assumed_ms_per_request !== undefined) {
    const assumedMsPerRequest = result.data.assumed_ms_per_request;
    const { data: attachedProjects } = await supabase
      .from("projects")
      .select("id, budget_minutes_per_month, keep_alive_budget_minutes_per_month, keep_alive_enabled")
      .eq("platform_account_id", id);

    for (const project of attachedProjects ?? []) {
      const update: { check_interval_seconds?: number; keep_alive_interval_minutes?: number } = {};
      if (project.budget_minutes_per_month !== null) {
        update.check_interval_seconds = intervalSecondsFromBudget(
          project.budget_minutes_per_month,
          assumedMsPerRequest,
        );
      }
      if (project.keep_alive_enabled && project.keep_alive_budget_minutes_per_month !== null) {
        update.keep_alive_interval_minutes = keepAliveIntervalMinutesFromBudget(
          project.keep_alive_budget_minutes_per_month,
          assumedMsPerRequest,
        );
      }
      if (Object.keys(update).length > 0) {
        await supabase.from("projects").update(update).eq("id", project.id);
      }
    }
  }

  return { data, error: null };
}

/**
 * Permanently deletes a platform account. `projects.platform_account_id` is `on delete set
 * null` (see supabase/migrations/*_add_platform_budget_to_projects.sql) -- every attached
 * project detaches back to manual-interval mode instead of being deleted itself.
 */
export async function deletePlatformAccount(id: string): Promise<PlatformAccountActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_accounts")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Platform account not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Read-only wrapper around `getPlatformAccountsWithUsage` (lib/queries.ts), callable directly
 * from a Client Component -- `AddProjectForm` (features/projects) needs the current user's
 * accounts + live pool usage for its budget calculator, but can't import lib/queries.ts itself
 * (it depends on `@/lib/supabase/server`, which pulls in `next/headers` and can't be bundled
 * into client code; only a "use server" action gets the automatic client-callable RPC wrapper).
 */
export async function listPlatformAccountsForForm(): Promise<{
  data: PlatformAccountWithUsage[] | null;
  error: string | null;
}> {
  return getPlatformAccountsWithUsage();
}
