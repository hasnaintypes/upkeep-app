// Email channel via Resend (PRD §5.5, Phase 6, #44): the fourth real
// `ChannelDispatcher` implementation behind #40's plugin contract -- sends
// an incident-open/incident-resolve email through Resend's HTTP API
// (https://resend.com/docs/api-reference/emails/send-email), the same
// fetch-based style as discord.ts (#41)/webhook.ts (#43), not raw SMTP
// (Deno Edge Functions have no first-class SMTP client, and an HTTP-API
// transactional provider is simpler and more reliable in a serverless
// runtime anyway).
//
// No custom domain required: without a verified sending domain, Resend
// only allows sending *from* its own shared `onboarding@resend.dev`
// address and *to* the email address the API key's account was created
// with -- which is exactly this app's actual use case (a single self-
// hosting user alerting themselves about their own projects, not sending
// to arbitrary third parties), so this is a permanent, free configuration
// here, not just a temporary sandbox limitation to graduate out of. A
// verified domain (once/if the user gets one) only needs
// `RESEND_FROM_ADDRESS` set -- no code change.
//
// API key handling (#44's own AC): the key is never read via `Deno.env`
// inside this module -- `createEmailDispatcher` takes it as a parameter,
// resolved exactly once from `Deno.env.get("RESEND_API_KEY")` in
// dispatch.ts (see that module's own `DISPATCHERS` wiring). This keeps the
// key out of every test in this file entirely (no `--allow-env` needed to
// run `email.test.ts`) and means there is exactly one place in the whole
// codebase that ever reads the raw secret. It is never included in any
// `console.error` call below -- only Resend's own (key-free) response body
// is ever logged on failure.

import type { ChannelDispatcher, NotificationEvent } from "./dispatch.ts";

/** A `notification_channels` row of `type = "email"`'s own `config` shape
 * -- just the destination address. Validated at dispatch time, not
 * centrally in dispatch.ts, per that module's own "each dispatcher
 * validates its own config" convention. */
type EmailConfig = { to: string };

// Deliberately light -- catches the obviously-malformed case (missing "@",
// empty string) without attempting full RFC 5322 validation, which Resend's
// own API will reject anyway if truly invalid (surfaced as a normal
// dispatch failure, not a client-side false negative).
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailConfig(config: unknown): config is EmailConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    typeof (config as Record<string, unknown>).to === "string" &&
    EMAIL_LIKE.test((config as EmailConfig).to)
  );
}

const DEFAULT_FROM_ADDRESS = "Upkeep <onboarding@resend.dev>";

function formatTimestamp(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

/** "2h 15m"-style duration -- same shape as discord.ts's own
 * `formatDuration` (duplicated, not imported -- see that module's own
 * comment on why: this app's own dashboard has a third copy too, since
 * none of Deno/Deno/Next.js can import across each other's boundaries). */
function formatDuration(startedAt: string, resolvedAt: string): string {
  const elapsedMs = Math.max(0, new Date(resolvedAt).getTime() - new Date(startedAt).getTime());
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds the email's subject/HTML/plain-text content for one incident
 * transition -- exported so `email.test.ts` can assert on it independently
 * of the Resend API call around it. Field parity with #41's Discord
 * message per this issue's own acceptance criterion: project name, status,
 * start time, and (on resolve) resolved time + duration, plus `cause` when
 * one was recorded.
 */
export function buildEmailContent(
  event: NotificationEvent,
): { subject: string; html: string; text: string } {
  const isOpen = event.kind === "opened";

  const rows: [string, string][] = [
    ["Project", event.project.name],
    ["Status", isOpen ? "Down" : "Resolved"],
    ["Started", formatTimestamp(event.incident.started_at)],
  ];

  if (!isOpen && event.incident.resolved_at) {
    rows.push(
      ["Resolved", formatTimestamp(event.incident.resolved_at)],
      ["Duration", formatDuration(event.incident.started_at, event.incident.resolved_at)],
    );
  }

  if (event.incident.cause) {
    rows.push(["Cause", event.incident.cause]);
  }

  const subject = isOpen
    ? `🔴 ${event.project.name} is down`
    : `✅ ${event.project.name} is back up`;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 12px;">${isOpen ? "🔴 Incident opened" : "✅ Incident resolved"}</h2>
      <table style="border-collapse: collapse; width: 100%;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding: 4px 12px 4px 0; color: #666; white-space: nowrap;">${escapeHtml(label)}</td>
            <td style="padding: 4px 0;"><strong>${escapeHtml(value)}</strong></td>
          </tr>`,
          )
          .join("")}
      </table>
      <p style="color: #999; font-size: 12px; margin-top: 16px;">Sent by Upkeep</p>
    </div>
  `.trim();

  const text = [isOpen ? "Incident opened" : "Incident resolved", "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");

  return { subject, html, text };
}

/**
 * Creates the email `ChannelDispatcher`, closing over an already-resolved
 * API key/from-address rather than reading `Deno.env` itself -- see this
 * module's own top comment for why. Contract: never throws (see
 * dispatch.ts's `ChannelDispatcher` doc comment) -- a missing API key, a
 * malformed/missing `config.to`, a network failure, or a non-2xx response
 * from Resend are all reported as `{ ok: false, error }`. Resend's own
 * error response body (never the API key) is the only thing ever logged.
 */
export function createEmailDispatcher(
  apiKey: string | undefined,
  fromAddress: string = DEFAULT_FROM_ADDRESS,
): ChannelDispatcher {
  return async (channel, event) => {
    if (!apiKey) {
      return { ok: false, error: "RESEND_API_KEY is not configured for this deployment" };
    }
    if (!isEmailConfig(channel.config)) {
      return { ok: false, error: "email channel config is missing a valid \"to\" address" };
    }

    const { subject, html, text } = buildEmailContent(event);

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: channel.config.to,
          subject,
          html,
          text,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `resend request failed: ${message}` };
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `resend responded ${response.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
      };
    }

    return { ok: true };
  };
}
