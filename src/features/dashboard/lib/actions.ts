"use server";

import { createClient } from "@/lib/supabase/server";
import { getNotificationChannels } from "@/features/notifications/lib/queries";
import type { NotificationChannel } from "@/features/notifications/types";
import type { IncidentActionResult } from "../types";

/**
 * Read-only data the settings dialog needs (signed-in email + this user's notification
 * channels), fetched lazily on first open rather than eagerly in `dashboard/layout.tsx` --
 * avoids adding a channels query to every single dashboard page load for users who never open
 * settings, and avoids wrapping the whole layout in a blocking Suspense boundary just to supply
 * two props a Client Component (`SettingsDialogProvider`, settings-dialog.tsx) could fetch
 * itself via this "use server" action instead (same `next/headers` constraint/workaround as
 * `listPlatformAccountsForForm` in features/platform-accounts/lib/actions.ts). `email: null`
 * means the session lookup came back empty -- the dialog itself never gets reached by a
 * signed-out visitor regardless (every dashboard page already guards that), so this isn't a
 * real auth check, just a defensive fallback.
 */
export async function getSettingsDialogData(): Promise<{
  email: string | null;
  channels: NotificationChannel[];
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email ?? null;
  if (!email) {
    return { email: null, channels: [] };
  }

  const { data: channels } = await getNotificationChannels();
  return { email, channels: channels ?? [] };
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
