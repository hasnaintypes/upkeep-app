import type { CheckStatus } from "@/features/projects";
import type { Database } from "@/lib/supabase/types";

/** The four rolling-uptime windows the overview page shows (PRD §5.6, #29). */
export type UptimeWindowKey = "24h" | "7d" | "30d" | "90d";

/**
 * One row of `get_project_uptime_summary()`'s result (see
 * supabase/migrations/*_create_get_project_uptime_summary_function.sql).
 * Hand-widened from the generated RPC return type: `supabase gen types`
 * can't tell that `last_status`/`last_checked_at`/`uptime_*` are nullable
 * from a `returns table (...)` definition (it only reflects column types,
 * not the LEFT JOINs and `case ... else null` inside the function body that
 * make every one of them possibly-null in practice -- a project with zero
 * checks ever, or zero checks within a given window).
 */
export type ProjectUptimeSummary = Omit<
  Database["public"]["Functions"]["get_project_uptime_summary"]["Returns"][number],
  "last_status" | "last_checked_at" | "uptime_24h" | "uptime_7d" | "uptime_30d" | "uptime_90d"
> & {
  last_status: CheckStatus | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  uptime_90d: number | null;
};
