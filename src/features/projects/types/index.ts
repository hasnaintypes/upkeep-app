import type { Tables } from "@/lib/supabase/types";

/**
 * A row from the `projects` table (PRD §6). Sourced from the generated Supabase
 * `Database` type — regenerate via `pnpm gen:types` after any schema change
 * instead of hand-editing this type.
 */
export type Project = Tables<"projects">;

/**
 * Common shape returned by the project actions in features/projects/lib/actions.ts.
 * `data` carries the mutated row back on success (null on error) so callers --
 * e.g. the project list view -- can update local state without a full re-fetch.
 */
export type ProjectActionResult = {
  data: Project | null;
  error: string | null;
};

/**
 * A single project's manual "run check now" outcome (PRD §5.2/§3, issue
 * #28), as returned by the `prober` Edge Function's manual-check path
 * (supabase/functions/prober/manual-check.ts). Hand-declared, not derived
 * from the generated `Database` type -- this shape comes from an Edge
 * Function HTTP response, not a table row, and the Deno-side module that
 * defines it lives outside this app's TypeScript project (see AGENTS.md's
 * tsconfig exclusion note) so it can't be imported directly.
 */
export type ManualCheckResult = {
  status: "up" | "down" | "degraded" | "waking" | "unknown";
  http_status: number | null;
  response_time_ms: number;
  error_message: string | null;
};

/** Result of `runProjectCheckNow` (lib/run-check.ts). */
export type RunCheckActionResult =
  | { data: ManualCheckResult; error: null }
  | { data: null; error: string };
