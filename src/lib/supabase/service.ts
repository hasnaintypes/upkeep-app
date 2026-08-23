import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role Supabase client: bypasses Row Level Security entirely.
 *
 * This is a fourth execution context alongside client.ts (browser),
 * server.ts (cookie-based SSR, RLS as the signed-in user), and proxy.ts
 * (middleware session refresh) -- for trusted server-side code that must act
 * outside any single user's session, e.g. a webhook or the shared-secret
 * `/api/projects/register` route. `import "server-only"` makes any accidental
 * import from client code a build-time error, not just a lint warning.
 *
 * Never: import this into a Client Component, log the returned client or the
 * service role key, or call this from a route/action that hasn't already
 * authenticated the caller by some other means (there is no RLS backstop
 * here -- whatever this client does, it does as a superuser).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createServiceClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
