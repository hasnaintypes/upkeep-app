"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  DigestFrequency,
  NotificationChannelActionResult,
  NotificationChannelConfig,
  NotificationChannelType,
  NotificationRuleActionResult,
} from "../types";
import {
  digestFrequencySchema,
  discordConfigSchema,
  emailConfigSchema,
  escalationThresholdSchema,
  webhookConfigSchema,
} from "./validation";
import { maskChannelConfig } from "./config-mask";

/**
 * Server actions for notification channel + per-project rule CRUD (#45),
 * mirroring the typed-result pattern in features/projects/lib/actions.ts
 * (itself mirroring features/auth/lib/actions.ts, per AGENTS.md). Each wraps
 * a single Supabase call, runs on the server (cookie-based session client),
 * and returns a typed `{ data, error }` result.
 *
 * None of these actions filter by `user_id`, nor manually verify that a
 * `channel_id`/`project_id` belongs to the caller: ownership is enforced
 * entirely by the RLS policies on `notification_channels` and
 * `project_notification_rules` (see
 * supabase/migrations/*_notification_channels_table.sql and
 * *_project_notification_rules_table.sql) -- an id the caller doesn't own
 * is indistinguishable from a nonexistent one, which `.single()` +
 * `PGRST116` below turns into a "not found" message rather than a silent
 * no-op or a data leak.
 *
 * Every channel-returning action below returns `config` masked
 * (lib/config-mask.ts) -- raw webhook URLs are never sent back to the
 * client, including right after creating or updating one.
 */

function validateChannelConfig(
  type: NotificationChannelType,
  config: NotificationChannelConfig,
): { data: NotificationChannelConfig } | { error: string } {
  const schema =
    type === "discord" ? discordConfigSchema : type === "email" ? emailConfigSchema : webhookConfigSchema;

  const result = schema.safeParse(config);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid channel configuration." };
  }
  return { data: result.data };
}

/** Creates a notification channel owned by the current user. `user_id` is
 * intentionally not part of the input -- `notification_channels.user_id`
 * defaults to `auth.uid()`, so ownership comes from the caller's session. */
export async function createNotificationChannel(
  type: NotificationChannelType,
  config: NotificationChannelConfig,
): Promise<NotificationChannelActionResult> {
  const validated = validateChannelConfig(type, config);
  if ("error" in validated) {
    return { data: null, error: validated.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_channels")
    .insert({ type, config: validated.data })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: maskChannelConfig(data), error: null };
}

/**
 * Replaces a channel's `config` and/or toggles `is_active`. `type` is
 * required (not looked up server-side) so the caller's already-known type
 * picks the right validation schema without an extra round trip -- a
 * channel's `type` is otherwise immutable through this feature (changing it
 * would invalidate whatever `config` is already stored).
 */
export async function updateNotificationChannel(
  id: string,
  type: NotificationChannelType,
  patch: { config?: NotificationChannelConfig; is_active?: boolean },
): Promise<NotificationChannelActionResult> {
  const update: { config?: NotificationChannelConfig; is_active?: boolean } = {};

  if (patch.config !== undefined) {
    const validated = validateChannelConfig(type, patch.config);
    if ("error" in validated) {
      return { data: null, error: validated.error };
    }
    update.config = validated.data;
  }
  if (patch.is_active !== undefined) {
    update.is_active = patch.is_active;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_channels")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Channel not found." };
    }
    return { data: null, error: error.message };
  }
  return { data: maskChannelConfig(data), error: null };
}

/** Turns a channel on/off entirely (all of its rules, across every
 * project) -- distinct from a single rule's `is_muted`, see
 * `updateNotificationRule`'s doc comment. */
export async function setChannelActive(
  id: string,
  type: NotificationChannelType,
  isActive: boolean,
): Promise<NotificationChannelActionResult> {
  return updateNotificationChannel(id, type, { is_active: isActive });
}

/** Permanently deletes a channel. `on delete cascade` on
 * `project_notification_rules.channel_id` removes every rule referencing
 * it across every project, per that column's documented FK choice. */
export async function deleteNotificationChannel(
  id: string,
): Promise<NotificationChannelActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_channels")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Channel not found." };
    }
    return { data: null, error: error.message };
  }
  return { data: maskChannelConfig(data), error: null };
}

/**
 * Attaches an existing channel to a project with an initial
 * `escalation_threshold` (PRD §5.5, this issue's first acceptance
 * criterion). `project_notification_rules_project_channel_unique` rejects a
 * duplicate project+channel pair with a `23505` error, translated here into
 * a friendly message instead of a raw Postgres constraint name.
 */
export async function createNotificationRule(
  projectId: string,
  channelId: string,
  options: {
    escalationThreshold?: number;
    digestOnly?: boolean;
    digestFrequency?: DigestFrequency;
  } = {},
): Promise<NotificationRuleActionResult> {
  const thresholdResult = escalationThresholdSchema.safeParse(
    options.escalationThreshold ?? 1,
  );
  if (!thresholdResult.success) {
    return {
      data: null,
      error: thresholdResult.error.issues[0]?.message ?? "Invalid escalation threshold.",
    };
  }

  let digestFrequency: DigestFrequency | undefined;
  if (options.digestFrequency !== undefined) {
    const frequencyResult = digestFrequencySchema.safeParse(options.digestFrequency);
    if (!frequencyResult.success) {
      return { data: null, error: "Invalid digest frequency." };
    }
    digestFrequency = frequencyResult.data;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_notification_rules")
    .insert({
      project_id: projectId,
      channel_id: channelId,
      escalation_threshold: thresholdResult.data,
      ...(options.digestOnly !== undefined && { digest_only: options.digestOnly }),
      ...(digestFrequency !== undefined && { digest_frequency: digestFrequency }),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { data: null, error: "This channel is already attached to this project." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Updates a rule's `escalation_threshold`, `digest_only`, and/or `is_muted`
 * flags. `is_muted` is the "mute a project's notifications temporarily
 * without deleting the underlying rule" mechanism from this issue's second
 * acceptance criterion -- distinct from `setChannelActive`, which turns a
 * whole channel off across every project it's attached to.
 */
export async function updateNotificationRule(
  id: string,
  patch: {
    escalation_threshold?: number;
    digest_only?: boolean;
    digest_frequency?: DigestFrequency;
    is_muted?: boolean;
  },
): Promise<NotificationRuleActionResult> {
  const update: {
    escalation_threshold?: number;
    digest_only?: boolean;
    digest_frequency?: DigestFrequency;
    is_muted?: boolean;
  } = {};

  if (patch.escalation_threshold !== undefined) {
    const thresholdResult = escalationThresholdSchema.safeParse(patch.escalation_threshold);
    if (!thresholdResult.success) {
      return {
        data: null,
        error: thresholdResult.error.issues[0]?.message ?? "Invalid escalation threshold.",
      };
    }
    update.escalation_threshold = thresholdResult.data;
  }
  if (patch.digest_only !== undefined) {
    update.digest_only = patch.digest_only;
  }
  if (patch.digest_frequency !== undefined) {
    const frequencyResult = digestFrequencySchema.safeParse(patch.digest_frequency);
    if (!frequencyResult.success) {
      return { data: null, error: "Invalid digest frequency." };
    }
    update.digest_frequency = frequencyResult.data;
  }
  if (patch.is_muted !== undefined) {
    update.is_muted = patch.is_muted;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_notification_rules")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Notification rule not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/** Convenience wrapper for the rules panel's mute/unmute toggle. */
export async function setNotificationRuleMuted(
  id: string,
  isMuted: boolean,
): Promise<NotificationRuleActionResult> {
  return updateNotificationRule(id, { is_muted: isMuted });
}

/** Detaches a channel from a project (deletes the rule) without deleting
 * the channel itself -- the channel remains available to attach to other
 * projects, or this same project again later. */
export async function deleteNotificationRule(
  id: string,
): Promise<NotificationRuleActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_notification_rules")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: "Notification rule not found." };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
