import { z } from "zod";
import { ESCALATION_THRESHOLD_INPUT_MAX } from "../constants";

/**
 * Per-type `config` schemas -- shapes match each dispatcher's own `*Config`
 * type in `supabase/functions/notifier/*.ts` exactly (`discord.ts`'s
 * `DiscordConfig`, `email.ts`'s `EmailConfig`, `webhook.ts`'s
 * `WebhookConfig`), so a channel created through this form is guaranteed to
 * be dispatchable rather than silently failing at notify time with
 * "config is missing a valid webhook_url".
 */
export const discordConfigSchema = z.object({
  webhook_url: z
    .string()
    .trim()
    .url("Enter a full URL, including https://")
    .refine((url) => url.startsWith("https://"), "Discord webhook URLs use https://."),
});

export const emailConfigSchema = z.object({
  to: z.string().trim().email("Enter a valid email address."),
});

export const webhookConfigSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a full URL, including https://")
    .refine((url) => url.startsWith("https://"), "Webhook URLs must use https://."),
});

export const createChannelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("discord"), config: discordConfigSchema }),
  z.object({ type: z.literal("email"), config: emailConfigSchema }),
  z.object({ type: z.literal("webhook"), config: webhookConfigSchema }),
]);

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/**
 * Shared with the client-side rule form and the server actions, so both
 * enforce the same bounds from one definition (same pattern as
 * features/projects/lib/validation.ts's `healthUrlSchema`). The DB column
 * itself only requires `> 0` (see `project_notification_rules_escalation_
 * threshold_positive`); `ESCALATION_THRESHOLD_INPUT_MAX` is a UI-side
 * sanity ceiling, not a backend constraint.
 */
export const escalationThresholdSchema = z.coerce
  .number()
  .int()
  .min(1, "Must be at least 1.")
  .max(ESCALATION_THRESHOLD_INPUT_MAX, `Must be ${ESCALATION_THRESHOLD_INPUT_MAX} or less.`);
