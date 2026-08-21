import type { AuthError } from "@supabase/supabase-js";

/** Common shape returned by the auth actions in features/auth/lib/actions.ts */
export type AuthActionResult = {
  error: AuthError | null;
};
