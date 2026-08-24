"use server";

import { createClient } from "@/lib/supabase/server";
import type { IncidentActionResult } from "../types";

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
