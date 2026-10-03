"use server";

import { createClient } from "@/lib/supabase/server";
import { getNotificationChannels } from "@/features/notifications/lib/queries";
import type { NotificationChannel } from "@/features/notifications/types";
import {
  getHostingPlatformsWithTiers,
  getPlatformAccountsWithUsage,
} from "@/features/platform-accounts/lib/queries";
import type {
  HostingPlatformWithTiers,
  PlatformAccountWithUsage,
} from "@/features/platform-accounts/types";
import type { IncidentActionResult } from "../types";

/**
 * Read-only data the settings dialog needs (identity + profile fields, notification channels,
 * hosting accounts), fetched lazily on first open rather than eagerly in `dashboard/layout.tsx`
 * -- avoids adding several queries to every single dashboard page load for users who never open
 * settings, and avoids wrapping the whole layout in a blocking Suspense boundary just to supply
 * props a Client Component (`SettingsDialogProvider`, settings-dialog.tsx) could fetch itself
 * via this "use server" action instead (same `next/headers` constraint/workaround as
 * `listPlatformAccountsForForm` in features/platform-accounts/lib/actions.ts). `email: null`
 * means the session lookup came back empty -- the dialog itself never gets reached by a
 * signed-out visitor regardless (every dashboard page already guards that), so this isn't a
 * real auth check, just a defensive fallback.
 *
 * `fullName`/`username`/`avatarUrl` come from `user_metadata`, not a `profiles` table -- see
 * `updateProfile`'s own doc comment (features/auth/lib/actions.ts) for why. Reads via
 * `getUser()` here, not this codebase's usual `getClaims()` -- confirmed live (not assumed)
 * that `getClaims()` decodes the *existing* access token locally, so a `user_metadata` change
 * from `updateProfile()`/`AvatarUpload` doesn't appear until that token is naturally refreshed
 * (the access token itself isn't reissued just because metadata changed); `getUser()` always
 * makes a live call to the Auth server, so a profile edit is visible the moment settings is
 * reopened, not up to an hour later. Worth the extra round trip here specifically since this
 * whole function is already a lazy, on-demand fetch (not called on every page load the way
 * `getClaims()`-based checks elsewhere in this app are).
 *
 * Hosting accounts moved in here from the old standalone `/dashboard/hosting-accounts` page --
 * same reasoning as the rest of this dialog, one place instead of a page navigation.
 */
export async function getSettingsDialogData(): Promise<{
  email: string | null;
  userId: string | null;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  channels: NotificationChannel[];
  platformAccounts: PlatformAccountWithUsage[];
  hostingPlatforms: HostingPlatformWithTiers[];
}> {
  const empty = {
    email: null,
    userId: null,
    fullName: "",
    username: "",
    avatarUrl: null,
    channels: [],
    platformAccounts: [],
    hostingPlatforms: [],
  };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user?.email) {
    return empty;
  }

  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  const [
    { data: channels },
    { data: platformAccounts },
    { data: hostingPlatforms },
  ] = await Promise.all([
    getNotificationChannels(),
    getPlatformAccountsWithUsage(),
    getHostingPlatformsWithTiers(),
  ]);

  return {
    email: user.email,
    userId: user.id,
    fullName: typeof userMetadata.full_name === "string" ? userMetadata.full_name : "",
    username: typeof userMetadata.username === "string" ? userMetadata.username : "",
    avatarUrl: typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : null,
    channels: channels ?? [],
    platformAccounts: platformAccounts ?? [],
    hostingPlatforms: hostingPlatforms ?? [],
  };
}

/**
 * Manual incident annotation (PRD §5.4, Phase 5, #37): lets the owning user
 * attach/edit a note on one of their own incidents, editable whether the
 * incident is still open or already auto-resolved -- annotation is purely
 * informational and never touches `started_at`/`resolved_at`/`notified`,
 * only `cause`.
 *
 * Empty/whitespace-only input is normalized to `null` ("no note"), not
 * saved as a blank string -- mirrors `updateProject`'s own
 * trim-before-persist convention (features/projects/lib/actions.ts).
 *
 * Ownership is enforced entirely by `incidents_update_own` RLS (see
 * supabase/migrations/*_create_incidents_table.sql): a foreign incident id
 * matches zero rows under the caller's session, which `.single()` turns
 * into the same PGRST116 "not found" this function already returns for a
 * genuinely-missing id -- a caller can't distinguish "doesn't exist" from
 * "isn't yours" from the response, which is the correct behavior here (no
 * confirming another user's incident even exists).
 */
export async function updateIncidentCause(
  incidentId: string,
  cause: string,
): Promise<IncidentActionResult> {
  const normalizedCause = cause.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .update({ cause: normalizedCause })
    .eq("id", incidentId)
    .select("id, project_id, started_at, resolved_at, cause, notified")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Incident not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
