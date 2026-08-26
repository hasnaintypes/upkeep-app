import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hashApiKey } from "./generate";

/**
 * API key verification for POST /api/projects/register (#19, #47) --
 * replaces that route's old `UPKEEP_REGISTRATION_SECRET` shared-secret
 * stub. Deliberately NOT a Server Action (no "use server") and not exported
 * from index.ts: this must only ever be called from a route handler that
 * has no signed-in session of its own to rely on, using the service-role
 * client to bypass RLS for the lookup -- same reasoning as
 * features/projects/lib/register.ts staying out of the Server Actions
 * mechanism entirely.
 */
export type VerifiedApiKey = {
  userId: string;
  keyId: string;
};

/**
 * Looks up `candidate` by its hash (see lib/generate.ts's `hashApiKey` doc
 * comment for why an exact-match hash lookup is safe here) and returns the
 * owning user if it exists and hasn't been revoked. Also stamps
 * `last_used_at` -- best-effort, fire-and-forget: a failed write there must
 * never fail the caller's actual registration request.
 */
export async function verifyApiKey(candidate: string): Promise<VerifiedApiKey | null> {
  if (!candidate) {
    return null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hashApiKey(candidate))
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    return null;
  }

  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error: updateError }) => {
      if (updateError) {
        console.error("verifyApiKey: failed to stamp last_used_at", updateError);
      }
    });

  return { userId: data.user_id, keyId: data.id };
}
