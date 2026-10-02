import { z } from "zod";
import { PLATFORM_ACCOUNT_DEFAULTS } from "../constants";

/**
 * Shared with the client-side create/edit form and the createPlatformAccount/
 * updatePlatformAccount server actions, so both enforce identical rules from a single
 * definition -- same convention as features/projects/lib/validation.ts's `createProjectSchema`.
 */
export const platformAccountSchema = z.object({
  label: z.string().trim().min(1, "A label is required.").max(100),
  platform_id: z.string().uuid("Choose a platform."),
  tier_id: z.string().uuid("Choose a tier."),
  // Null is a valid, meaningful choice (unlimited / not budget-tracked) -- not the same as
  // "unset" -- so this stays nullable rather than optional-with-a-fallback.
  quota_minutes_per_month: z.coerce
    .number()
    .int()
    .min(0, "Quota can't be negative.")
    .nullable(),
  assumed_ms_per_request: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1ms.")
    .max(600_000, "Must be 600000ms (10 minutes) or less."),
});

export type PlatformAccountFormValues = z.infer<typeof platformAccountSchema>;

export const platformAccountFormDefaults: Omit<PlatformAccountFormValues, "platform_id" | "tier_id"> = {
  label: "",
  quota_minutes_per_month: null,
  assumed_ms_per_request: PLATFORM_ACCOUNT_DEFAULTS.assumedMsPerRequest,
};
