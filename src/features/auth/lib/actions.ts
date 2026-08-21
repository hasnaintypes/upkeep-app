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

export async function signOut(): Promise<AuthActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}
