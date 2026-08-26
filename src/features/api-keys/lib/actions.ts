"use server";

import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "./generate";
import { apiKeyLabelSchema } from "./validation";
import type { ApiKeyActionResult, CreateApiKeyResult } from "../types";

const SELECT_COLUMNS = "id, label, key_prefix, last_used_at, revoked_at, created_at";

/**
 * Server actions for API key generation/revocation (#47), mirroring the
 * typed-result pattern in features/notifications/lib/actions.ts. Both run
 * on the cookie-based session client (RLS as the signed-in user) -- unlike
 * lib/verify.ts, which runs unauthenticated via the service-role client for
 * the registration route, these always have a real caller to scope to.
 *
 * Every query here explicitly selects `SELECT_COLUMNS`, never `*` --
 * `key_hash` must never be sent to the client, not even on the row that was
 * just inserted (see types/index.ts's `ApiKey` doc comment).
 */

/**
 * Generates a new API key owned by the current user. Returns the plaintext
 * value exactly once, in the same response as the row itself -- this is the
 * only place in the app the plaintext key ever exists outside the user's
 * own copy of it. `user_id` is not part of the insert -- `api_keys.user_id`
 * defaults to `auth.uid()`, same convention as `notification_channels`.
 */
export async function createApiKey(label: string): Promise<CreateApiKeyResult> {
  const labelResult = apiKeyLabelSchema.safeParse(label);
  if (!labelResult.success) {
    return { data: null, error: labelResult.error.issues[0]?.message ?? "Invalid label." };
  }

  const { plaintextKey, keyHash, keyPrefix } = generateApiKey();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ label: labelResult.data, key_hash: keyHash, key_prefix: keyPrefix })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { data: null, error: "Couldn't generate a unique key -- please try again." };
    }
    return { data: null, error: error.message };
  }
  return { data: { ...data, plaintextKey }, error: null };
}

/** Revokes a key permanently (sets `revoked_at`) -- see that column's own
 * migration comment for why this is one-way, with no "unrevoke". Detaches
 * nothing else: a revoked key just starts failing `verifyApiKey` on its
 * next use. */
export async function revokeApiKey(id: string): Promise<ApiKeyActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "API key not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
