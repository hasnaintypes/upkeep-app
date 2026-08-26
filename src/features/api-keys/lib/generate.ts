import "server-only";
import { createHash, randomBytes } from "crypto";

/**
 * API key generation and hashing (#47). Deliberately its own module, not
 * folded into lib/actions.ts, because `hashApiKey` is also needed by
 * lib/verify.ts (called from the unauthenticated POST /api/projects/register
 * route, not a Server Action) -- both need the exact same hash function.
 *
 * `import "server-only"` guards this the same way features/projects/lib/
 * register.ts is guarded: `randomBytes`/`createHash` must never run in a
 * client bundle, and this module is trusted with the one moment a key's
 * plaintext exists at all.
 */

const KEY_PREFIX = "upk_";
/** Non-secret chars of the prefix shown in the management UI (beyond
 * `KEY_PREFIX` itself) -- enough to tell keys apart, nowhere near enough
 * entropy (32 bits) to be guessable/usable for auth on its own. */
const VISIBLE_PREFIX_CHARS = 8;

export type GeneratedApiKey = {
  /** The full secret, shown to the user exactly once (the create dialog's
   * reveal step) and never persisted anywhere -- only `keyHash` is stored. */
  plaintextKey: string;
  keyHash: string;
  keyPrefix: string;
};

/** SHA-256 hex digest of a candidate key. A plain, unsalted hash is
 * intentional and safe here -- see the `api_keys.key_hash` column comment
 * (supabase/migrations/*_create_api_keys_table.sql) for why: the input is
 * always 32 bytes of server-generated randomness, not a user-chosen
 * password, so there's no dictionary/rainbow-table risk, and an unsalted
 * hash is what allows verifyApiKey to look a key up by exact match on an
 * indexed column instead of iterating every row with a slow per-candidate
 * compare. */
export function hashApiKey(candidate: string): string {
  return createHash("sha256").update(candidate).digest("hex");
}

/** Generates a new API key. 32 bytes (256 bits) of randomness, base64url-
 * encoded so the key is a single URL/header-safe token with no padding or
 * `+`/`/` characters to escape in an `Authorization: Bearer <key>` header. */
export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url");
  const plaintextKey = `${KEY_PREFIX}${secret}`;

  return {
    plaintextKey,
    keyHash: hashApiKey(plaintextKey),
    keyPrefix: plaintextKey.slice(0, KEY_PREFIX.length + VISIBLE_PREFIX_CHARS),
  };
}
