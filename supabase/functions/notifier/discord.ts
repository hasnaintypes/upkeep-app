// Discord webhook channel (PRD §5.5, Phase 6, #41): the first real
// `ChannelDispatcher` implementation behind #40's plugin contract --
// posts a rich embed to a Discord incoming webhook on incident open and
// resolve, with visibly different color/title/fields for each per the
// issue's own acceptance criteria. Chosen as the v1 channel per the PRD's
// own §10 open-question recommendation ("Discord recommended for
// simplicity of webhook setup") and the Phase 6 readiness checklist's "get
// one channel working end-to-end before the others."

import type { ChannelDispatcher, NotificationEvent } from "./dispatch.ts";

/** A `notification_channels` row of `type = "discord"`'s own `config`
 * shape -- just the incoming webhook URL Discord gives you when creating
 * one (Server Settings > Integrations > Webhooks). Validated at dispatch
 * time, not centrally in dispatch.ts, per that module's own "each
 * dispatcher validates its own config" convention. */
type DiscordConfig = { webhook_url: string };

function isDiscordConfig(config: unknown): config is DiscordConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    typeof (config as Record<string, unknown>).webhook_url === "string" &&
    ((config as Record<string, unknown>).webhook_url as string).length > 0
  );
}

// Discord's own standard embed colors (decimal, not hex string) for
// red/green -- matches the "danger"/"success" semantics Discord's own
// clients and bots conventionally use, so this reads as expected to anyone
// used to Discord notifications generally, not just this app's.
const OPENED_COLOR = 0xed4245;
const RESOLVED_COLOR = 0x57f287;

/** "2h 15m"-style duration, coarsest-two-units only -- same shape as the
 * dashboard's own `formatIncidentDuration` (src/features/dashboard/lib/
 * incident-format.ts), duplicated here since Edge Functions can't import
 * across each other's directories (see notifier.ts's own
 * `ESCALATION_THRESHOLD` comment for the same constraint) and this Deno
 * module obviously can't import from the Next.js app either. */
function formatDuration(startedAt: string, resolvedAt: string): string {
  const elapsedMs = Math.max(
    0,
    new Date(resolvedAt).getTime() - new Date(startedAt).getTime(),
  );
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

/**
 * Builds the Discord webhook payload for one incident transition --
 * exported (not just used internally) so `discord.test.ts` can assert on
 * its exact shape independently of the network-call plumbing around it.
 * Fields cover the issue's own "enough context to act without opening the
 * dashboard" acceptance criterion: project name, status, start time (and
 * resolved time + duration on resolve), plus the incident's own `cause`
 * when one was recorded (#35's auto-derived cause or #37's manual note).
 */
export function buildDiscordPayload(event: NotificationEvent): unknown {
  const isOpen = event.kind === "opened";

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Project", value: event.project.name, inline: true },
    { name: "Status", value: isOpen ? "Down" : "Resolved", inline: true },
    { name: "Started", value: formatTimestamp(event.incident.started_at), inline: false },
  ];

  if (!isOpen && event.incident.resolved_at) {
    fields.push(
      { name: "Resolved", value: formatTimestamp(event.incident.resolved_at), inline: false },
      {
        name: "Duration",
        value: formatDuration(event.incident.started_at, event.incident.resolved_at),
        inline: false,
      },
    );
  }

  if (event.incident.cause) {
    fields.push({ name: "Cause", value: event.incident.cause, inline: false });
  }

  return {
    embeds: [
      {
        title: isOpen ? "🔴 Incident opened" : "✅ Incident resolved",
        color: isOpen ? OPENED_COLOR : RESOLVED_COLOR,
        fields,
        footer: { text: "Upkeep" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Posts one incident transition to a Discord incoming webhook. Contract:
 * never throws (see dispatch.ts's `ChannelDispatcher` doc comment) -- a
 * missing/malformed `config`, a network failure, or a non-2xx response
 * (a deleted/revoked webhook returns 404, per Discord's own API) are all
 * reported as `{ ok: false, error }`. Discord's success response is
 * `204 No Content` (no body to parse), so this only ever checks
 * `response.ok`, never the response body, on the success path.
 */
export const dispatchDiscord: ChannelDispatcher = async (channel, event) => {
  if (!isDiscordConfig(channel.config)) {
    return { ok: false, error: "discord channel config is missing a valid webhook_url" };
  }

  let response: Response;
  try {
    response = await fetch(channel.config.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(event)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `discord webhook request failed: ${message}` };
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    return {
      ok: false,
      error: `discord webhook responded ${response.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    };
  }

  return { ok: true };
};
