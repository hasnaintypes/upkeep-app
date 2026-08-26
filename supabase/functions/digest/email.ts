// Digest email content + delivery via Resend (PRD §5.5, Phase 6, #46).
//
// Deliberately its own copy of the Resend-POST boilerplate, not an import
// from ../notifier/email.ts -- Supabase Edge Functions are each their own
// independent deployment unit with no shared-code mechanism across function
// directories (confirmed: no `_shared/` directory exists anywhere under
// supabase/functions/ in this repo). Same reasoning notifier/email.ts's own
// top comment gives for duplicating discord.ts's `formatDuration` rather
// than importing it.
//
// API key handling: same convention as notifier/dispatch.ts's `DISPATCHERS`
// wiring -- `RESEND_API_KEY`/`RESEND_FROM_ADDRESS` are read exactly once,
// in index.ts, and threaded into `createDigestEmailSender` as parameters,
// never read via `Deno.env` inside this module. Reuses the *same* Resend
// account/secrets #44 already set up -- no new secret needed for digest
// mode.

// Type-only import -- avoids a runtime circular dependency with digest.ts
// (which imports this module's own value exports), since these two type
// aliases are erased entirely at compile time.
import type { DigestFrequency, PortfolioProject } from "./digest.ts";

const DEFAULT_FROM_ADDRESS = "Upkeep <onboarding@resend.dev>";

/** Result of one digest send attempt -- same `{ok}`/`{ok:false,error}` shape
 * as notifier/dispatch.ts's `DispatchResult`, so one recipient's failure
 * can't throw and abort every other recipient's digest in the same run
 * (see digest.ts's own `runDigest`). */
export type DigestSendResult = { ok: true } | { ok: false; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUptime(percentage: number | null): string {
  return percentage === null ? "no data" : `${percentage}%`;
}

function formatStatus(status: string | null): string {
  return status ?? "unknown";
}

const STATUS_EMOJI: Record<string, string> = {
  up: "\u{1F7E2}", // 🟢
  degraded: "\u{1F7E1}", // 🟡
  waking: "\u{1F7E1}", // 🟡
  down: "\u{1F534}", // 🔴
  unknown: "\u{26AA}", // ⚪
};

/**
 * Builds the digest email's subject/HTML/plain-text content -- exported so
 * `email.test.ts` can assert on it independently of the Resend API call
 * around it, same split as notifier/email.ts's `buildEmailContent`.
 * Portfolio-level (#46's own acceptance criterion): every active project
 * the recipient owns appears as one row in a single email, never one email
 * per project. A recipient with zero active projects still gets a (short)
 * confirming email, not silence -- "no projects" and "digest didn't run"
 * should never look the same to the person reading their inbox.
 */
export function buildDigestEmailContent(
  frequency: DigestFrequency,
  projects: PortfolioProject[],
): { subject: string; html: string; text: string } {
  const periodLabel = frequency === "daily" ? "last 24 hours" : "last 7 days";
  const totalIncidents = projects.reduce((sum, p) => sum + p.incident_count, 0);
  const anyDown = projects.some((p) => p.last_status === "down");

  const subject =
    projects.length === 0
      ? `Your ${frequency} Upkeep digest`
      : anyDown
        ? `\u{1F534} Your ${frequency} Upkeep digest -- action needed`
        : `\u{1F7E2} Your ${frequency} Upkeep digest -- all clear`;

  const introText =
    projects.length === 0
      ? "You have no active projects being monitored."
      : `${projects.length} active project${projects.length === 1 ? "" : "s"}, ${totalIncidents} incident${totalIncidents === 1 ? "" : "s"} over the ${periodLabel}.`;

  const rows = projects.map((p) => ({
    name: p.project_name,
    emoji: STATUS_EMOJI[p.last_status ?? "unknown"] ?? STATUS_EMOJI.unknown,
    status: formatStatus(p.last_status),
    uptime: formatUptime(p.uptime_percentage),
    incidents: p.incident_count,
  }));

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px;">
      <h2 style="margin-bottom: 4px;">Upkeep ${frequency} digest</h2>
      <p style="color: #666; margin-top: 0;">${escapeHtml(introText)}</p>
      ${
        rows.length > 0
          ? `<table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 4px 12px 4px 0; color: #666; font-size: 12px;">Project</th>
            <th style="text-align: left; padding: 4px 12px 4px 0; color: #666; font-size: 12px;">Status</th>
            <th style="text-align: left; padding: 4px 12px 4px 0; color: #666; font-size: 12px;">Uptime</th>
            <th style="text-align: left; padding: 4px 0; color: #666; font-size: 12px;">Incidents</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
          <tr>
            <td style="padding: 4px 12px 4px 0;"><strong>${escapeHtml(r.name)}</strong></td>
            <td style="padding: 4px 12px 4px 0;">${r.emoji} ${escapeHtml(r.status)}</td>
            <td style="padding: 4px 12px 4px 0;">${escapeHtml(r.uptime)}</td>
            <td style="padding: 4px 0;">${r.incidents}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
          : ""
      }
      <p style="color: #999; font-size: 12px; margin-top: 16px;">Sent by Upkeep</p>
    </div>
  `.trim();

  const text = [
    `Upkeep ${frequency} digest`,
    introText,
    "",
    ...rows.map((r) => `${r.name}: ${r.status}, uptime ${r.uptime}, ${r.incidents} incident(s)`),
  ].join("\n");

  return { subject, html, text };
}

/**
 * Creates the digest email sender, closing over an already-resolved API
 * key/from-address rather than reading `Deno.env` itself (see this
 * module's own top comment). Contract: never throws -- a missing API key,
 * a network failure, or a non-2xx response from Resend are all reported as
 * `{ ok: false, error }`, so one recipient's failed send can't abort
 * `runDigest`'s loop over every other recipient in the same run (#46's own
 * "digest delivery does not depend on real-time incident dispatch"
 * acceptance criterion extends naturally to "one broken recipient doesn't
 * block every other recipient" too).
 */
export function createDigestEmailSender(
  apiKey: string | undefined,
  fromAddress: string = DEFAULT_FROM_ADDRESS,
) {
  return async (
    to: string,
    content: { subject: string; html: string; text: string },
  ): Promise<DigestSendResult> => {
    if (!apiKey) {
      return { ok: false, error: "RESEND_API_KEY is not configured for this deployment" };
    }

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
          to,
          subject: content.subject,
          html: content.html,
          text: content.text,
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

export type DigestEmailSender = ReturnType<typeof createDigestEmailSender>;
