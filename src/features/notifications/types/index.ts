import type { Tables } from "@/lib/supabase/types";

/**
 * A row from the `notification_channels` table (PRD §6, #9). `config` is
 * always the *masked* shape by the time it reaches a Client Component --
 * see lib/config-mask.ts. Nothing in this feature ever hands the raw
 * `config` value to the client.
 */
export type NotificationChannel = Tables<"notification_channels">;

/**
 * A row from the `project_notification_rules` table (PRD §6, #9). `is_muted`
 * is the "mute a project's notifications temporarily without deleting the
 * underlying rule" mechanism from PRD §5.5 / this issue's acceptance
 * criteria (added by the `add_notification_mute_and_resolved_notified`
 * migration).
 */
export type ProjectNotificationRule = Tables<"project_notification_rules">;

/**
 * The channel types the `notifier` Edge Function (#40) actually knows how to
 * dispatch to (`supabase/functions/notifier/dispatch.ts`'s `DISPATCHERS`
 * map), matching `notification_channels_type_valid`'s check constraint.
 * Hand-declared rather than derived from the generated `Database` type --
 * `notification_channels.type` comes back as plain `string` there (a `text`
 * column + check constraint isn't reflected as a TS union), same reasoning
 * as `CheckStatus` in features/projects/types/index.ts.
 */
export type NotificationChannelType = "discord" | "email" | "webhook";

/** `notification_channels.config` shape per type -- matches each
 * dispatcher's own `*Config` type in `supabase/functions/notifier/*.ts`
 * (`discord.ts`'s `DiscordConfig`, `email.ts`'s `EmailConfig`, `webhook.ts`'s
 * `WebhookConfig`), so a channel created here is guaranteed dispatchable. */
export type DiscordChannelConfig = { webhook_url: string };
export type EmailChannelConfig = { to: string };
export type WebhookChannelConfig = { url: string };
export type NotificationChannelConfig =
  | DiscordChannelConfig
  | EmailChannelConfig
  | WebhookChannelConfig;

/**
 * A `project_notification_rules` row joined with its `notification_channels`
 * row, as returned by `getProjectNotificationRules` (lib/queries.ts) -- the
 * shape the per-project rules panel renders (it needs the channel's type and
 * masked config to label each rule, not just the raw rule row).
 */
export type NotificationRuleWithChannel = ProjectNotificationRule & {
  notification_channels: NotificationChannel;
};

/** Common shape returned by the channel actions in lib/actions.ts, mirroring
 * `ProjectActionResult` (features/projects/types/index.ts). */
export type NotificationChannelActionResult = {
  data: NotificationChannel | null;
  error: string | null;
};

/** Common shape returned by the rule actions in lib/actions.ts. */
export type NotificationRuleActionResult = {
  data: ProjectNotificationRule | null;
  error: string | null;
};
