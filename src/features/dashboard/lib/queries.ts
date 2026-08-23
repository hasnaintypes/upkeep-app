import { createClient } from "@/lib/supabase/server";
import type { ProjectUptimeSummary } from "../types";

/**
 * Per-active-project latest status + 24h/7d/30d/90d uptime % for the
 * dashboard overview page (PRD §5.6, #29). One RPC round trip (see
 * supabase/migrations/*_create_get_project_uptime_summary_function.sql),
 * not N+1 client-side queries -- relies entirely on that function's own
 * `security invoker` + the existing `projects`/`checks`/`checks_aggregated`
 * RLS policies for scoping, the same "don't filter by user_id here"
 * convention as `getProjects` (features/projects/lib/queries.ts).
 */
export async function getProjectUptimeSummaries(): Promise<{
  data: ProjectUptimeSummary[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_uptime_summary");

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data ?? []) as unknown as ProjectUptimeSummary[], error: null };
}
