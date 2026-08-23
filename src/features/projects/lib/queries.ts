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

/**
 * Fetches one of the current user's projects by id, for the per-project
 * detail page (PRD §5.6, Phase 4, #30). Same RLS-only scoping as
 * `getProjects` -- a mismatched/foreign id is indistinguishable from a
 * nonexistent one (PGRST116, "no rows"), which is the correct "not found"
 * behavior either way, not a data leak.
 */
export async function getProjectById(id: string): Promise<{
  data: Project | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Project not found." };
    }
    return { data: null, error: error.message };
  }
  return { data: maskProjectHeaders(data), error: null };
}

/**
 * Distinct, sorted collection names across the current user's projects --
 * for the "Add project" form's Collection autocomplete, at the call sites
 * that don't already have a full project list in memory (the sidebar's
 * quick-add button, the dashboard/projects-page headers -- see
 * `AddProjectTrigger`). Deliberately selects only the `collection` column,
 * not `select("*")` -- this is called from places that need nothing else
 * about the projects, including the dashboard layout on every page load.
 */
export async function getExistingCollections(): Promise<{
  data: string[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("collection")
    .not("collection", "is", null);

  if (error) {
    return { data: null, error: error.message };
  }

  const unique = Array.from(
    new Set(data.map((row) => row.collection).filter((c): c is string => !!c?.trim())),
  ).sort((a, b) => a.localeCompare(b));

  return { data: unique, error: null };
}
