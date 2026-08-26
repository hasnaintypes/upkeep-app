import { createClient } from "@/lib/supabase/server";
import type { NotificationChannel, NotificationRuleWithChannel } from "../types";
import { maskChannelConfig } from "./config-mask";

/**
 * Lists the current user's notification channels, for the channel
 * management page and the per-project rules panel's "attach a channel"
 * picker. Relies entirely on the `notification_channels_select_own` RLS
 * policy for scoping -- no manual `user_id` filter, same convention as
 * features/projects/lib/queries.ts's `getProjects`.
 *
 * `config` is masked before returning (lib/config-mask.ts) -- raw webhook
 * URLs never reach the client from this query.
 */
export async function getNotificationChannels(): Promise<{
  data: NotificationChannel[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_channels")
    .select("*")
    .order("type", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data.map(maskChannelConfig), error: null };
}

/**
 * Lists the notification rules attached to one project, joined with each
 * rule's channel, for the per-project rules panel (this issue, #45). Scoped
 * by `project_notification_rules_select_own` (verifies the *project's*
 * owner, via an `exists` against `projects`) -- a mismatched/foreign
 * `projectId` simply returns an empty list, not an error, matching RLS's
 * usual "no rows" behavior for anything not owned by the caller.
 */
export async function getProjectNotificationRules(projectId: string): Promise<{
  data: NotificationRuleWithChannel[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_notification_rules")
    .select("*, notification_channels(*)")
    .eq("project_id", projectId)
    .order("id", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const masked = data.map((rule) => ({
    ...rule,
    notification_channels: maskChannelConfig(rule.notification_channels),
  }));
  return { data: masked, error: null };
}
