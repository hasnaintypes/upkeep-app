import { createClient } from "@/lib/supabase/server";
import type { Project } from "../types";

/**
 * Lists the current user's projects. Relies entirely on the
 * `projects_select_own` RLS policy for scoping -- deliberately does not
 * filter by `user_id` here, so a bug in this function can't accidentally
 * widen what's returned beyond what RLS already allows.
 */
export async function getProjects(): Promise<{
  data: Project[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return { data, error: error?.message ?? null };
}
