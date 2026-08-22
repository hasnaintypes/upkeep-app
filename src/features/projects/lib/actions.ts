"use server";

import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/types";
import type { ProjectActionResult } from "../types";
import { healthUrlSchema } from "./validation";

/**
 * Server actions for project CRUD. Each wraps a single Supabase call and
 * returns a typed result, mirroring the pattern in
 * features/auth/lib/actions.ts. These run on the server (server Supabase
 * client, cookie-based session) -- never call Supabase directly from a
 * Client Component for these mutations.
 *
 * None of these actions filter by `user_id`: ownership is enforced entirely
 * by the `projects` table's RLS policies (see
 * supabase/migrations/*_create_projects_table.sql), so there's nothing here
 * that could drift out of sync with those policies.
 */

type CreateProjectInput = Pick<TablesInsert<"projects">, "name" | "health_url"> &
  Partial<
    Omit<
      TablesInsert<"projects">,
      "id" | "user_id" | "name" | "health_url" | "created_at" | "updated_at"
    >
  >;

/**
 * Creates a project owned by the current user. `user_id` is intentionally not
 * part of the input type -- the `projects.user_id` column defaults to
 * `auth.uid()`, so the owning user is derived from the caller's session, not
 * from anything passed in here.
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectActionResult> {
  if (!input.name.trim()) {
    return { data: null, error: "Project name is required." };
  }

  // Re-validates the same https/localhost rule the "Add project" form
  // applies client-side (src/features/projects/lib/validation.ts), so a
  // caller that bypasses the form (or a future bulk-import/API route) can't
  // slip an insecure health_url past it.
  const healthUrlResult = healthUrlSchema.safeParse(input.health_url);
  if (!healthUrlResult.success) {
    return {
      data: null,
      error: healthUrlResult.error.issues[0]?.message ?? "Invalid health check URL.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...input, health_url: healthUrlResult.data })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

type UpdateProjectInput = Partial<
  Omit<TablesUpdate<"projects">, "id" | "user_id" | "created_at" | "updated_at">
>;

/**
 * Updates a project by id and returns the updated row (the project list view
 * uses this to update its local state without a full page reload). If `id`
 * doesn't exist or isn't owned by the current user, the
 * `projects_update_own` RLS policy silently excludes it, and `.single()`
 * turns that into a PGRST116 ("no rows") error instead of a false "success".
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectActionResult> {
  if (input.name !== undefined && !input.name.trim()) {
    return { data: null, error: "Project name cannot be empty." };
  }

  if (input.health_url !== undefined) {
    const healthUrlResult = healthUrlSchema.safeParse(input.health_url);
    if (!healthUrlResult.success) {
      return {
        data: null,
        error: healthUrlResult.error.issues[0]?.message ?? "Invalid health check URL.",
      };
    }
    input = { ...input, health_url: healthUrlResult.data };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Project not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Pauses or resumes monitoring for a project without deleting its history.
 * Added alongside `deactivateProject` (#13) because the project list view
 * needs a two-way toggle, not just one-directional deactivation.
 */
export async function setProjectActive(
  id: string,
  isActive: boolean,
): Promise<ProjectActionResult> {
  return updateProject(id, { is_active: isActive });
}

/** Pauses monitoring for a project without deleting its history. */
export async function deactivateProject(id: string): Promise<ProjectActionResult> {
  return setProjectActive(id, false);
}

/**
 * Permanently deletes a project. `on delete cascade` on the `checks` /
 * `incidents` / `checks_aggregated` / `project_notification_rules` foreign
 * keys removes everything derived from it. Same RLS-backed ownership check as
 * updateProject.
 */
export async function deleteProject(id: string): Promise<ProjectActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Project not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
