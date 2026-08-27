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
  checkType: "http",
  isPublic: false,
} as const;

/** The four check types the prober supports (PRD §5.2, Phase 9,
 * #55/#56/#57) -- `http` (the original GET/POST/HEAD check against
 * `health_url` as a URL), `tcp` (a bare connection attempt against
 * `health_url` parsed as "host:port"), `dns` (resolves `health_url` as a
 * bare hostname), or `ssl` (a TLS handshake against `health_url` parsed
 * as "host:port", checking certificate validity/expiry). None of the
 * latter three have a request/response body or status to grade. See
 * supabase/functions/prober/check.ts's own `CheckType` for the mirrored
 * type on the prober side. */
export const CHECK_TYPES = ["http", "tcp", "dns", "ssl"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

/**
 * IANA time zone names the keep-alive active window's start/end times are
 * offered against (PRD §5.8, #49) -- sourced from the runtime's own time
 * zone database via `Intl.supportedValuesOf`, not a hand-maintained list, so
 * it never drifts from what `is_valid_timezone()` (see
 * supabase/migrations/*_add_keep_alive_active_window.sql) actually accepts.
 * Available in every runtime this app targets (browsers since 2022, Node 18+
 * for the createProject server action's own re-validation) -- see MDN's
 * compat table if that ever needs revisiting.
 */
export const IANA_TIMEZONES: readonly string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

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
