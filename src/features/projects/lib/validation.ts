import { z } from "zod";
import { PROJECT_DEFAULTS } from "../constants";

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
  tags: z.array(z.string().trim().min(1)).max(20, "Up to 20 tags.").optional(),
  // Only meaningful on create: once a project exists, header/token changes go
  // through the dedicated updateProjectHeaders action (lib/actions.ts) so
  // existing secret values can be merged server-side instead of round-tripped
  // through this form. See lib/headers.ts for the masking rationale.
  headers: z
    .record(z.string().trim().min(1), z.string().trim().min(1))
    .optional(),
});

export type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

/** Pre-filled values for a new, unsaved project, matching the DB column defaults. */
export const createProjectFormDefaults: CreateProjectFormValues = {
  name: "",
  description: "",
  health_url: "",
  method: PROJECT_DEFAULTS.method,
  expected_status: PROJECT_DEFAULTS.expectedStatus,
  check_interval_seconds: PROJECT_DEFAULTS.checkIntervalSeconds,
  timeout_ms: PROJECT_DEFAULTS.timeoutMs,
  hosting_provider: "",
  tags: [],
  headers: {},
};
