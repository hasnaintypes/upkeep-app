import { z } from "zod";
import { CHECK_TYPES, IANA_TIMEZONES, PROJECT_DEFAULTS } from "../constants";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * `health_url` must be a well-formed URL. HTTPS is required outside of
 * development; `http://localhost` (or 127.0.0.1 / ::1) is only allowed while
 * developing. Decided per the Phase 2 readiness checklist (docs/ROADMAP.md) --
 * a prober running in production can never actually reach a teammate's
 * localhost, so allowing it there would just hide a broken URL until deploy.
 *
 * Exported (not just used inline in createProjectSchema below) so the
 * createProject server action can re-validate this one rule server-side too,
 * without requiring every other create-form field to be present.
 */
export const healthUrlSchema = z
  .string()
  .trim()
  .min(1, "Health check URL is required.")
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a full URL, including https://",
      });
      return;
    }

    const isDev = process.env.NODE_ENV !== "production";
    const isLocalhost = LOCAL_HOSTNAMES.has(url.hostname);

    if (url.protocol !== "https:" && !(isDev && isLocalhost)) {
      ctx.addIssue({
        code: "custom",
        message: isDev
          ? "URL must start with https://, or http://localhost while developing."
          : "URL must start with https://.",
      });
    }
  });

/**
 * `check_type === "tcp"`'s target validation: "host:port", not a URL (PRD
 * §5.2, Phase 9, #55). Exported (like healthUrlSchema) so createProject/
 * updateProject can re-validate server-side too. Mirrors (does not import
 * -- can't; separate Deno runtime/module graph) `parseTcpTarget` in
 * supabase/functions/prober/check.ts -- keep the two in sync if this format
 * ever changes. Syntax-only, same as healthUrlSchema: whether the host
 * actually resolves/accepts connections is exactly what the prober's own
 * check determines at check time, not at save time.
 */
export const tcpTargetSchema = z
  .string()
  .trim()
  .min(1, "A target is required.")
  .superRefine((value, ctx) => {
    const separatorIndex = value.lastIndexOf(":");
    const host = separatorIndex > 0 ? value.slice(0, separatorIndex) : "";
    const port = Number(value.slice(separatorIndex + 1));

    if (
      separatorIndex <= 0 ||
      separatorIndex === value.length - 1 ||
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      ctx.addIssue({
        code: "custom",
        message: 'Enter a target as "host:port" (e.g. db.example.com:5432).',
      });
    }
  });

/** RFC 1123-style hostname: dot-separated labels, each 1-63 chars,
 * alphanumeric/hyphen, no leading/trailing hyphen per label, 253 chars
 * total. */
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/;

/**
 * `check_type === "dns"`'s target validation: a bare hostname, no scheme/
 * port (PRD §5.2, Phase 9, #56). Exported (like healthUrlSchema/
 * tcpTargetSchema) so createProject/updateProject can re-validate
 * server-side too. Syntax-only, same reasoning as the other two target
 * schemas -- whether the hostname actually resolves is exactly what the
 * prober's own check (supabase/functions/prober/check.ts's runDnsCheck)
 * determines at check time, not at save time.
 */
export const dnsTargetSchema = z
  .string()
  .trim()
  .min(1, "A hostname is required.")
  .superRefine((value, ctx) => {
    if (!HOSTNAME_PATTERN.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid hostname (e.g. example.com), no scheme or port.",
      });
    }
  });

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * `<input type="time">` reports an empty string when cleared, never
 * `undefined` -- normalized to `null` here (not kept as `""`) since the
 * underlying `projects.keep_alive_window_start`/`_end` columns are `time`,
 * which rejects an empty string as an invalid literal. `null` is also this
 * feature's actual "unset" sentinel end to end, matching
 * `keep_alive_timezone` below and the DB's own all-or-nothing check
 * constraint (see supabase/migrations/*_add_keep_alive_active_window.sql).
 */
const optionalTimeOfDay = z
  .string()
  .trim()
  .refine((value) => value === "" || TIME_OF_DAY_PATTERN.test(value), "Enter a time as HH:MM.")
  .optional()
  .transform((value) => (value ? value : null));

/**
 * Validated against the runtime's own IANA time zone database
 * (constants/index.ts's `IANA_TIMEZONES`, from `Intl.supportedValuesOf`)
 * rather than just checking "non-empty" -- so a typo'd zone name is caught
 * in the form instead of surfacing later as a silent scheduling no-op or a
 * DB round-trip rejected by `is_valid_timezone()`.
 */
const optionalTimezone = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || IANA_TIMEZONES.includes(value),
    "Enter a valid IANA time zone (e.g. America/New_York).",
  )
  .optional()
  .transform((value) => (value ? value : null));

/**
 * Shared with the client-side "Add project" form and the createProject
 * server action, so both enforce identical rules from a single definition.
 */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required.").max(200),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional(),
  // Format depends on check_type -- validated in the object-level
  // superRefine below (healthUrlSchema's https:// rule, tcpTargetSchema's
  // "host:port" rule, or dnsTargetSchema's bare-hostname rule), not here,
  // so a valid tcp/dns target isn't rejected by an unconditionally-applied
  // URL check.
  health_url: z.string().trim().min(1, "A target is required."),
  check_type: z.enum(CHECK_TYPES).optional(),
  method: z.enum(["GET", "POST", "HEAD"]),
  // Only meaningful for non-GET methods -- fetch() clients (including the
  // prober's) reject a body on GET requests, so the prober only sends this
  // when method !== "GET" (supabase/functions/prober/check.ts).
  body: z
    .string()
    .trim()
    .max(10000, "Request body must be 10000 characters or fewer.")
    .optional(),
  expected_status: z.coerce
    .number()
    .int()
    .min(100, "Must be a valid HTTP status code (100-599).")
    .max(599, "Must be a valid HTTP status code (100-599)."),
  check_interval_seconds: z.coerce
    .number()
    .int()
    .min(30, "Must check at least every 30 seconds.")
    .max(86400, "Must check at least once a day."),
  timeout_ms: z.coerce
    .number()
    .int()
    .min(1000, "Timeout must be at least 1000ms.")
    .max(120000, "Timeout must be 120000ms or less."),
  hosting_provider: z
    .string()
    .trim()
    .max(100, "Hosting provider must be 100 characters or fewer.")
    .optional(),
  // A project belongs to at most one collection ("folder") -- PRD §5.1. See
  // supabase/migrations/*_add_collection_to_projects_table.sql for why this
  // is a plain nullable column rather than a dedicated collections table.
  collection: z
    .string()
    .trim()
    .max(100, "Collection name must be 100 characters or fewer.")
    .optional(),
  tags: z.array(z.string().trim().min(1)).max(20, "Up to 20 tags.").optional(),
  // Only meaningful on create: once a project exists, header/token changes go
  // through the dedicated updateProjectHeaders action (lib/actions.ts) so
  // existing secret values can be merged server-side instead of round-tripped
  // through this form. See lib/headers.ts for the masking rationale.
  headers: z
    .record(z.string().trim().min(1), z.string().trim().min(1))
    .optional(),
  // Independent of monitoring/alerting (PRD §5.8) -- pings every 10 minutes
  // purely to prevent free-tier idling. See PROJECT_DEFAULTS.keepAliveEnabled.
  keep_alive_enabled: z.boolean().optional(),
  // The daily window keep-alive pings are restricted to, in
  // keep_alive_timezone -- null/unset on any of the three means "always
  // warm" (PRD §5.8's explicit fallback), enforced together below since the
  // DB requires all three or none (see the migration referenced above).
  keep_alive_window_start: optionalTimeOfDay,
  keep_alive_window_end: optionalTimeOfDay,
  keep_alive_timezone: optionalTimezone,
  // Opt-in public status page (PRD §5.6, Phase 8, #51/#52) -- defaults to
  // false (PROJECT_DEFAULTS.isPublic), matching this app's owner-only-by-
  // default posture everywhere else. No format validation needed here (it's
  // a plain boolean); the actual gating (only the owner can flip it, only a
  // public project's data is ever readable at /status/[id]) is enforced by
  // the projects_update_own RLS policy and the get_public_project_*/
  // is_project_publicly_visible() security definer functions, not this
  // schema -- see supabase/migrations/*_add_public_status_pages.sql.
  is_public: z.boolean().optional(),
}).superRefine((values, ctx) => {
  const checkType = values.check_type ?? "http";
  // ssl reuses tcpTargetSchema as-is -- same "host:port" format, see
  // check.ts's runSslCheck reusing parseTcpTarget for the same reason.
  const targetValidator =
    checkType === "tcp" || checkType === "ssl"
      ? tcpTargetSchema
      : checkType === "dns"
        ? dnsTargetSchema
        : healthUrlSchema;
  const targetResult = targetValidator.safeParse(values.health_url);
  if (!targetResult.success) {
    for (const issue of targetResult.error.issues) {
      ctx.addIssue({ ...issue, path: ["health_url"] });
    }
  }

  const { keep_alive_window_start, keep_alive_window_end, keep_alive_timezone } = values;
  const setCount = [keep_alive_window_start, keep_alive_window_end, keep_alive_timezone].filter(
    (value) => value !== null,
  ).length;

  if (setCount > 0 && setCount < 3) {
    if (keep_alive_window_start === null) {
      ctx.addIssue({
        code: "custom",
        path: ["keep_alive_window_start"],
        message: "Set a start time, or clear the other active window fields.",
      });
    }
    if (keep_alive_window_end === null) {
      ctx.addIssue({
        code: "custom",
        path: ["keep_alive_window_end"],
        message: "Set an end time, or clear the other active window fields.",
      });
    }
    if (keep_alive_timezone === null) {
      ctx.addIssue({
        code: "custom",
        path: ["keep_alive_timezone"],
        message: "Set a time zone, or clear the other active window fields.",
      });
    }
  }

  if (
    keep_alive_window_start !== null &&
    keep_alive_window_end !== null &&
    keep_alive_window_start === keep_alive_window_end
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["keep_alive_window_end"],
      message: "End time must be different from the start time.",
    });
  }
});

export type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

/** Pre-filled values for a new, unsaved project, matching the DB column defaults. */
export const createProjectFormDefaults: CreateProjectFormValues = {
  name: "",
  description: "",
  health_url: "",
  check_type: PROJECT_DEFAULTS.checkType,
  method: PROJECT_DEFAULTS.method,
  body: "",
  expected_status: PROJECT_DEFAULTS.expectedStatus,
  check_interval_seconds: PROJECT_DEFAULTS.checkIntervalSeconds,
  timeout_ms: PROJECT_DEFAULTS.timeoutMs,
  hosting_provider: "",
  collection: "",
  tags: [],
  headers: {},
  keep_alive_enabled: PROJECT_DEFAULTS.keepAliveEnabled,
  keep_alive_window_start: null,
  keep_alive_window_end: null,
  keep_alive_timezone: null,
  is_public: PROJECT_DEFAULTS.isPublic,
};
