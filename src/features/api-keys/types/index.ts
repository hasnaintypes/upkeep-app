import type { Tables } from "@/lib/supabase/types";

/**
 * The columns of an `api_keys` row that are safe to ever send to the
 * client -- deliberately narrower than `Tables<"api_keys">`, which also has
 * `key_hash` and `user_id`. `key_hash` is never selected in any query in
 * this feature (not even masked): unlike `notification_channels.config`,
 * there's no legitimate reason for the client to see even a redacted form
 * of it, since it exists purely for server-side lookup in `lib/verify.ts`.
 * `user_id` is redundant client-side -- ownership is already implied by RLS
 * scoping every query to the caller's own rows.
 */
export type ApiKey = Pick<
  Tables<"api_keys">,
  "id" | "label" | "key_prefix" | "last_used_at" | "revoked_at" | "created_at"
>;

/** An `ApiKey` plus the one-time plaintext value, returned only by
 * `createApiKey`'s success path -- never stored in component state beyond
 * the reveal step, and never returned by any other action/query in this
 * feature (see lib/generate.ts's doc comment). */
export type CreatedApiKey = ApiKey & { plaintextKey: string };

/** Common shape returned by the read-only key actions (revoke). */
export type ApiKeyActionResult = {
  data: ApiKey | null;
  error: string | null;
};

/** Result of `createApiKey` -- carries the one-time plaintext value instead
 * of a plain `ApiKey` on success. */
export type CreateApiKeyResult = {
  data: CreatedApiKey | null;
  error: string | null;
};
