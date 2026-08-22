import type { Tables } from "@/lib/supabase/types";

/**
 * A row from the `projects` table (PRD §6). Sourced from the generated Supabase
 * `Database` type — regenerate via `pnpm gen:types` after any schema change
 * instead of hand-editing this type.
 */
export type Project = Tables<"projects">;

/** Common shape returned by the project actions in features/projects/lib/actions.ts */
export type ProjectActionResult = {
  error: string | null;
};
