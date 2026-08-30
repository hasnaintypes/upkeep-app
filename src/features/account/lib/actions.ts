"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { DeleteAccountResult } from "../types";

/**
 * Permanently deletes the signed-in user's account. Every table that
 * belongs to a user (`projects`, `notification_channels`, `api_keys`)
 * declares `user_id ... references auth.users (id) on delete cascade`, so
 * deleting the `auth.users` row itself is enough -- there is no separate
 * per-table cleanup to do here, and none should be added speculatively.
 *
 * Two clients, deliberately: the cookie-based session client only
 * identifies *who* is asking (never trust a caller-supplied user id for a
 * destructive action like this one), then the actual delete runs on the
 * service-role client since `auth.admin.deleteUser` isn't reachable under
 * RLS as a normal signed-in user.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return { error: "Not signed in." };
  }

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  return { error: error?.message ?? null };
}
