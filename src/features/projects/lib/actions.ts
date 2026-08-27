"use server";

import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/types";
import type { ProjectActionResult } from "../types";
import { dnsTargetSchema, healthUrlSchema, tcpTargetSchema } from "./validation";
import { type HeaderMap, maskProjectHeaders, mergeHeaders } from "./headers";

/**
 * Re-validates `health_url` server-side against whichever format its
 * `check_type` actually requires (#55/#56/#57) -- `healthUrlSchema`'s
 * https:// rule for `"http"` (the default, and the only option that
 * existed before #55), `tcpTargetSchema`'s "host:port" rule for `"tcp"`
 * and `"ssl"` (same target format, see validation.ts's own comment), or
 * `dnsTargetSchema`'s bare-hostname rule for `"dns"`. Shared by both
 * createProject and updateProject below so the two can't drift.
 */
function validateHealthUrl(checkType: string | undefined, healthUrl: string) {
  if (checkType === "tcp" || checkType === "ssl") return tcpTargetSchema.safeParse(healthUrl);
  if (checkType === "dns") return dnsTargetSchema.safeParse(healthUrl);
  return healthUrlSchema.safeParse(healthUrl);
}

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
 *
 * Every action below returns `headers` masked (lib/headers.ts) -- raw custom
 * header / bearer token values are never sent back to the client, including
 * right after creating or updating them.
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

  // Re-validates the same rule the "Add project" form applies client-side
  // (src/features/projects/lib/validation.ts), so a caller that bypasses
  // the form (or a future bulk-import/API route) can't slip an insecure
  // health_url -- or, for check_type = "tcp", a malformed target -- past
  // it. `input.check_type` absent means the DB's own `'http'` default
  // applies (see the add_tcp_check_type migration), matching
  // validateHealthUrl's own fallback.
  const healthUrlResult = validateHealthUrl(input.check_type, input.health_url);
  if (!healthUrlResult.success) {
    return {
      data: null,
      error: healthUrlResult.error.issues[0]?.message ?? "Invalid check target.",
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
  return { data: maskProjectHeaders(data), error: null };
}

// `headers` is deliberately excluded: it's managed exclusively through
// updateProjectHeaders below, which merges against the *raw* stored value.
// If this generic action accepted `headers`, a client re-submitting the
// masked placeholder strings it was shown (e.g. "••••1234") would overwrite
// the real secret with garbage.
type UpdateProjectInput = Partial<
  Omit<
    TablesUpdate<"projects">,
    "id" | "user_id" | "created_at" | "updated_at" | "headers"
  >
>;

/**
 * Updates a project's non-header fields by id and returns the updated row
 * (the project list view uses this to update its local state without a full
 * page reload). If `id` doesn't exist or isn't owned by the current user, the
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

  const supabase = await createClient();

  if (input.health_url !== undefined) {
    let checkType = input.check_type;
    if (checkType === undefined) {
      // This update doesn't touch check_type -- re-validate health_url
      // against whichever check type the project *already* has, not the
      // "http" default, so a tcp-type project's "host:port" target isn't
      // rejected by the https:// rule just because a caller updated
      // health_url without resending check_type in the same call (#55).
      // The one real caller (add-project-form.tsx) always sends both
      // together, so this lookup only ever runs for a hypothetical
      // narrower caller -- worth the extra round trip to validate
      // correctly rather than guess.
      const { data: existing, error: fetchError } = await supabase
        .from("projects")
        .select("check_type")
        .eq("id", id)
        .single();
      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          return { data: null, error: "Project not found." };
        }
        return { data: null, error: fetchError.message };
      }
      checkType = existing.check_type;
    }

    const healthUrlResult = validateHealthUrl(checkType, input.health_url);
    if (!healthUrlResult.success) {
      return {
        data: null,
        error: healthUrlResult.error.issues[0]?.message ?? "Invalid check target.",
      };
    }
    input = { ...input, health_url: healthUrlResult.data };
  }

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
  return { data: maskProjectHeaders(data), error: null };
}

/**
 * Adds/changes (`set`) and/or deletes (`remove`) individual custom headers /
 * bearer tokens on a project, per PRD §5.1 / §8. This is the *only* action
 * allowed to read a project's raw `headers` value -- it fetches the current
 * raw value server-side, merges in the caller's changes, writes the result,
 * and returns it masked. The client never has to (and never can) send back
 * the full existing header set just to add or remove one entry.
 */
export async function updateProjectHeaders(
  id: string,
  { set = {}, remove = [] }: { set?: HeaderMap; remove?: string[] },
): Promise<ProjectActionResult> {
  for (const key of Object.keys(set)) {
    if (!key.trim()) {
      return { data: null, error: "Header name cannot be empty." };
    }
    if (!set[key].trim()) {
      return { data: null, error: `Header "${key}" cannot have an empty value.` };
    }
  }

  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("headers")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return { data: null, error: "Project not found." };
    }
    return { data: null, error: fetchError.message };
  }

  const merged = mergeHeaders(current.headers, set, remove);

  const { data, error } = await supabase
    .from("projects")
    .update({ headers: Object.keys(merged).length > 0 ? merged : null })
    .eq("id", id)
    .select()
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
  return { data: maskProjectHeaders(data), error: null };
}
