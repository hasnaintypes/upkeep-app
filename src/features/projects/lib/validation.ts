import { z } from "zod";
import { IANA_TIMEZONES, PROJECT_DEFAULTS } from "../constants";

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
  health_url: healthUrlSchema,
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
}).superRefine((values, ctx) => {
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
};
