import { createClient } from "@/lib/supabase/server";
import type { ApiKey } from "../types";

/**
 * Lists the current user's API keys, newest first, for the management page
 * (#47). Relies entirely on the `api_keys_select_own` RLS policy for
 * scoping -- no manual `user_id` filter, same convention as
 * features/notifications/lib/queries.ts's `getNotificationChannels`.
 *
 * Selects columns explicitly (never `*`) -- `key_hash` must never reach the
 * client, see types/index.ts's `ApiKey` doc comment.
 */
export async function getApiKeys(): Promise<{
  data: ApiKey[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, label, key_prefix, last_used_at, revoked_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
