import type { DigestFrequency, NotificationChannelType } from "../types";

/** Ordered options for the "add channel" type select, matching the
 * `notification_channels_type_valid` check constraint and the
 * `DISPATCHERS` map in `supabase/functions/notifier/dispatch.ts` (#40-44).
 * Telegram is intentionally absent -- descoped and removed from the schema
 * entirely (#42, see docs/PRD.md §5.5). */
export const NOTIFICATION_CHANNEL_TYPES: {
  value: NotificationChannelType;
  label: string;
}[] = [
  { value: "discord", label: "Discord webhook" },
  { value: "email", label: "Email" },
  { value: "webhook", label: "Generic webhook" },
];

export const NOTIFICATION_CHANNEL_TYPE_LABELS: Record<NotificationChannelType, string> =
  Object.fromEntries(
    NOTIFICATION_CHANNEL_TYPES.map(({ value, label }) => [value, label]),
  ) as Record<NotificationChannelType, string>;

/** Default `escalation_threshold` for a newly attached rule, matching the
 * `project_notification_rules.escalation_threshold` column default. */
export const DEFAULT_ESCALATION_THRESHOLD = 1;

/**
 * `notifier`'s own fixed incident-open threshold
 * (`supabase/functions/notifier/notifier.ts`'s `ESCALATION_THRESHOLD`
 * constant, #40). A rule's `escalation_threshold` only ever has an effect
 * at or below this value today -- there's no mechanism yet to track a
 * failure streak past the moment an incident opens (a documented v1
 * limitation, not a bug). Surfaced in the rules panel's copy so a user
 * setting a higher threshold understands why that rule would never fire,
 * rather than silently capping the input to hide the limitation.
 */
export const NOTIFIER_MAX_EFFECTIVE_ESCALATION_THRESHOLD = 2;

/** Upper bound accepted by the escalation threshold input -- generous
 * beyond `NOTIFIER_MAX_EFFECTIVE_ESCALATION_THRESHOLD` since the DB column
 * itself only requires `> 0` and a future prober change could raise the
 * effective ceiling without a UI change. */
export const ESCALATION_THRESHOLD_INPUT_MAX = 10;

/** Ordered options for the digest frequency select (#46), matching the
 * `project_notification_rules_digest_frequency_valid` check constraint and
 * the two `pg_cron` schedules in the `schedule_digest_cron` migration. */
export const DIGEST_FREQUENCY_OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export const DEFAULT_DIGEST_FREQUENCY: DigestFrequency = "daily";
