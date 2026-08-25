// Generic outgoing webhook channel (PRD §5.5, Phase 6, #43): the second
// real `ChannelDispatcher` implementation behind #40's plugin contract --
// posts a stable, versioned-in-spirit JSON payload to an arbitrary
// third-party URL on incident open and resolve, so a user can wire up
// their own integration without Upkeep needing to know anything about it.
//
// Unlike discord.ts (#41), which formats a message for a specific third
// party's own API shape, this dispatcher's payload *is* the public
// contract -- documented in full at WEBHOOK_PAYLOAD.md (co-located, not
// under docs/, since that folder is gitignored internal-only material --
// see that file's own top note), which
// any consumer should be pointed at rather than reverse-engineering this
// file. Changing this payload's shape is a breaking change for every
// existing consumer, not a routine refactor.

import type { ChannelDispatcher, NotificationEvent } from "./dispatch.ts";

/** A `notification_channels` row of `type = "webhook"`'s own `config`
 * shape -- just the destination URL. Validated at dispatch time, not
 * centrally in dispatch.ts, per that module's own "each dispatcher
 * validates its own config" convention (same as discord.ts's
 * `DiscordConfig`). */
type WebhookConfig = { url: string };

function isWebhookConfig(config: unknown): config is WebhookConfig {
  if (
    typeof config !== "object" ||
    config === null ||
    typeof (config as Record<string, unknown>).url !== "string"
  ) {
    return false;
  }

  try {
    // New URL(...) also rejects a non-absolute string outright (throws),
    // which a bare non-empty-string check wouldn't catch -- this needs to
    // be an absolute http(s) URL fetch() can actually target, not just any
    // non-empty string.
    const parsed = new URL((config as WebhookConfig).url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Builds the outgoing webhook's JSON body -- exported so
 * `webhook.test.ts` can assert on its exact shape independently of the
 * network-call plumbing, and so this one function is the actual source of
 * truth the WEBHOOK_PAYLOAD.md contract describes (keep both in
 * sync if this ever changes).
 */
export function buildWebhookPayload(event: NotificationEvent): unknown {
  const isOpen = event.kind === "opened";
  const durationSeconds =
    !isOpen && event.incident.resolved_at
      ? Math.round(
          (new Date(event.incident.resolved_at).getTime() -
            new Date(event.incident.started_at).getTime()) /
            1000,
        )
      : null;

  return {
    event: isOpen ? "incident.opened" : "incident.resolved",
    project: {
      id: event.project.id,
      name: event.project.name,
    },
    incident: {
      id: event.incident.id,
      started_at: event.incident.started_at,
      resolved_at: event.incident.resolved_at,
      duration_seconds: durationSeconds,
      cause: event.incident.cause,
    },
    sent_at: new Date().toISOString(),
  };
}

/**
 * Posts one incident transition to a user-configured URL. Contract: never
 * throws (see dispatch.ts's `ChannelDispatcher` doc comment) -- a missing/
 * invalid `config.url`, a network failure (DNS, connection refused,
 * timeout), or a non-2xx response are all reported as
 * `{ ok: false, error }`. Unlike discord.ts, an arbitrary third party's
 * response body isn't a known shape worth parsing -- only `response.ok`
 * and `response.status` are used, never the body, on either path.
 */
export const dispatchWebhook: ChannelDispatcher = async (channel, event) => {
  if (!isWebhookConfig(channel.config)) {
    return { ok: false, error: "webhook channel config is missing a valid absolute http(s) url" };
  }

  let response: Response;
  try {
    response = await fetch(channel.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(event)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `webhook request failed: ${message}` };
  }

  if (!response.ok) {
    return { ok: false, error: `webhook endpoint responded ${response.status}` };
  }

  return { ok: true };
};
