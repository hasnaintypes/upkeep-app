/** Supabase table name for projects, for use in query/mutation builders. */
export const PROJECTS_TABLE = "projects" as const;

/**
 * Default values applied by the `projects` table migration (see
 * supabase/migrations/*_create_projects_table.sql / PRD §6). Mirrored here so
 * future forms/actions can pre-fill new-project fields without re-deriving
 * them from the schema.
 */
export const PROJECT_DEFAULTS = {
  method: "GET",
  expectedStatus: 200,
  checkIntervalSeconds: 300,
  timeoutMs: 10000,
  retryCount: 1,
  isActive: true,
  keepAliveEnabled: false,
} as const;

/**
 * Minimum time between manual "run check now" triggers for the same
 * project (PRD §5.2/§3, issue #28) -- must match the
 * `try_claim_manual_check` SQL function's own `p_cooldown_seconds` default
 * (see supabase/migrations/*_add_manual_check_rate_limit.sql) since
 * lib/run-check.ts passes this value explicitly rather than relying on the
 * database default, so a "please wait Ns" UI message can be computed
 * without a second round trip.
 */
export const MANUAL_CHECK_COOLDOWN_SECONDS = 30;
