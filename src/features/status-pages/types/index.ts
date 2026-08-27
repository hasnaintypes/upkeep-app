import type { CheckStatus } from "@/features/projects";
import type { Database } from "@/lib/supabase/types";

/**
 * One row of `get_public_project_status()` (see
 * supabase/migrations/*_add_public_status_pages.sql), for the public status
 * page (PRD §5.6, Phase 8, #51). Hand-widened from the generated RPC return
 * type, same reasoning as dashboard's `ProjectUptimeSummary` -- `returns
 * table (...)` doesn't reflect that every one of these columns is
 * genuinely nullable (a project with zero checks ever, or zero checks
 * within a given window), only that the function itself can return zero
 * rows (a private/nonexistent project).
 */
export type PublicProjectStatus = Omit<
  Database["public"]["Functions"]["get_public_project_status"]["Returns"][number],
  "description" | "last_status" | "last_checked_at" | "uptime_24h" | "uptime_7d" | "uptime_30d" | "uptime_90d"
> & {
  description: string | null;
  last_status: CheckStatus | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  uptime_90d: number | null;
};
