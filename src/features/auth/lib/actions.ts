import { createClient } from "@/lib/supabase/client";
import type { AuthActionResult } from "../types";

/**
 * Client-side auth actions. Each wraps a Supabase auth call so components
 * stay focused on UI/form state instead of talking to Supabase directly.
 */

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { error };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });
  return { error };
}

export async function resetPasswordForEmail(
  email: string,
  redirectTo: string,
): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  return { error };
}

export async function updatePassword(
  password: string,
): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

/**
 * Starts an email-change request: Supabase sends a confirmation link (to
 * the new address, and to the old one too if the project has "secure
 * email change" enabled) rather than updating `auth.users.email`
 * immediately -- the account's email only actually changes once that link
 * is clicked. `emailRedirectTo` is where that link lands the user
 * afterward (mirrors `signUpWithPassword`/`resetPasswordForEmail`'s own
 * `redirectTo`/`emailRedirectTo` params -- the caller builds the full
 * `${origin}${path}` URL, not this action). The link itself always routes
 * through `/auth/confirm` first (this app's existing generic
 * `verifyOtp({ type, token_hash })` handler already covers Supabase's
 * `"email_change"` OTP type with no changes needed -- it isn't
 * hardcoded to any one flow), which then redirects to `emailRedirectTo`.
 */
export async function updateEmail(
  email: string,
  emailRedirectTo: string,
): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
  return { error };
}

export async function signOut(): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}
