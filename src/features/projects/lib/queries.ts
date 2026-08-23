import { createClient } from "@/lib/supabase/server";
import type { Project } from "../types";
import { maskProjectHeaders } from "./headers";

/**
 * Lists the current user's projects. Relies entirely on the
 * `projects_select_own` RLS policy for scoping -- deliberately does not
 * filter by `user_id` here, so a bug in this function can't accidentally
 * widen what's returned beyond what RLS already allows.
 *
 * `headers` is masked before returning (see lib/headers.ts) -- raw custom
 * header / bearer token values never reach the client from this query.
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

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data.map(maskProjectHeaders), error: null };
}

/**
 * Lists the current user's *active* projects only, ordered by name -- for
 * the dashboard overview page (PRD §5.6, #29), which per its own acceptance
 * criteria only shows "every active project owned by the signed-in user"
 * (a paused project has nothing current to monitor, so it doesn't belong
 * on a live status overview). Same RLS-only scoping as `getProjects`.
 */
export async function getActiveProjects(): Promise<{
  data: Project[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data.map(maskProjectHeaders), error: null };
}
