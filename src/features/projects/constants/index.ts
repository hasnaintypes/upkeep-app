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
