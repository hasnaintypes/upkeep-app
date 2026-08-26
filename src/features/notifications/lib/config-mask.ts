/**
 * `notification_channels.config` masking (PRD §6, #9's own column comment:
 * "never return unmasked to the client on read -- ... must redact secret
 * fields before serializing this column in any response"). Every server
 * query/action in this feature that could return a `notification_channels`
 * row MUST route it through `maskChannelConfig` first -- see lib/queries.ts
 * and lib/actions.ts, which apply it unconditionally, mirroring
 * features/projects/lib/headers.ts's `maskProjectHeaders` convention for
 * the same reason (including right after creating/updating a channel).
 *
 * Only `discord.webhook_url` and `webhook.url` are masked -- both are
 * bearer-style secrets (anyone with the URL can post as that channel).
 * `email.to` is a destination address, not a secret, and is shown in full
 * so a user can confirm which inbox a channel is configured to alert.
 */

import type {
  NotificationChannel,
  NotificationChannelType,
} from "../types";

const SECRET_CONFIG_KEY: Partial<Record<NotificationChannelType, string>> = {
  discord: "webhook_url",
  webhook: "url",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Shows only the last 4 characters of a secret value, e.g. "••••1234" --
 * same convention as `maskHeaderValue` (features/projects/lib/headers.ts). */
function maskSecret(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

/** Masks the secret-bearing field of a `config` value for the given channel
 * `type`. Non-object/malformed input becomes `{}`, same "never leak the raw
 * value" fallback `maskHeaders` uses for malformed `headers`. */
export function maskChannelConfigValue(
  type: string,
  config: unknown,
): Record<string, unknown> {
  if (!isRecord(config)) {
    return {};
  }

  const secretKey = SECRET_CONFIG_KEY[type as NotificationChannelType];
  if (!secretKey || typeof config[secretKey] !== "string") {
    return { ...config };
  }

  return { ...config, [secretKey]: maskSecret(config[secretKey] as string) };
}

/** Returns a shallow copy of a `notification_channels` row with `config` masked. */
export function maskChannelConfig<T extends { type: string; config: unknown }>(
  channel: T,
): T {
  return { ...channel, config: maskChannelConfigValue(channel.type, channel.config) };
}

/**
 * One-line, safe-to-display summary of a channel's config for list/select
 * UI (e.g. "Webhook ending in ••••1234", "ops@example.com") -- built from an
 * already-masked `NotificationChannel` (never call this with a raw,
 * unmasked config).
 */
export function describeChannelConfig(channel: NotificationChannel): string {
  const config = channel.config;
  if (!isRecord(config)) {
    return "Not configured";
  }

  switch (channel.type as NotificationChannelType) {
    case "discord":
      return typeof config.webhook_url === "string"
        ? `Webhook ending in ${config.webhook_url}`
        : "Not configured";
    case "email":
      return typeof config.to === "string" ? config.to : "Not configured";
    case "webhook":
      return typeof config.url === "string" ? `URL ending in ${config.url}` : "Not configured";
    default:
      return "Not configured";
  }
}
