// Notification channel dispatch contract (PRD §5.5/§5.10, Phase 6, #40):
// the plugin-style interface every channel type (Discord #41, generic
// webhook #43, email #44) implements independently against, so
// `notifier.ts`'s own orchestration logic never branches on channel type
// itself -- adding a new channel type is "write one function matching
// `ChannelDispatcher` and register it below", not "add a new `if` branch
// inside the notifier's core loop" (PRD §5.10's own plugin-architecture
// wording).
//
// #40's own scope was this contract plus the routing/orchestration that
// decides *which* channels get an event (see notifier.ts) -- not the real
// channel integrations themselves, each its own follow-up issue. Discord
// (#41), generic webhook (#43), and email via Resend (#44) are all real
// implementations now (see discord.ts/webhook.ts/email.ts).
//
// Telegram was descoped, not stubbed (#42, see docs/PRD.md §5.5) -- unlike
// webhook/email, which are still-planned follow-ups, there is deliberately
// no `"telegram"` in `NotificationChannelType` and no stub entry in
// `DISPATCHERS` below, and the `notification_channels.type` check
// constraint (remove_telegram_channel_type migration) no longer allows a
// row of that type to even be created. Revisit only if there's real
// demand -- see #42's closing comment.

import { dispatchDiscord } from "./discord.ts";
import { dispatchWebhook } from "./webhook.ts";
import { createEmailDispatcher } from "./email.ts";

/** `Deno.env.get` throws (not returns `undefined`) when the `env`
 * permission for that specific variable hasn't been granted -- true for a
 * plain `deno test` run with no `--allow-env` flag, which this project's
 * documented workflow (AGENTS.md) deliberately doesn't require. The
 * deployed Edge Function runtime grants access to its own configured
 * secrets automatically, so this only ever falls back to `undefined`
 * locally under `deno test`/`deno check` -- exactly the same "not
 * configured" state as a genuinely-unset secret, which
 * `createEmailDispatcher` already handles gracefully (#44's own
 * "fails gracefully" acceptance criterion). */
function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/** One `notification_channels` row, exactly as dispatchers need it -- `type`
 * narrowed to the three values the table's own check constraint allows
 * (see the create_notification_channels_table / remove_telegram_channel_type
 * migrations), `config` left as the raw `Json` shape since its actual
 * structure is type-specific (a webhook URL, an email address, etc.) and
 * validated by each dispatcher itself, not centrally. */
export type NotificationChannelType = "discord" | "email" | "webhook";

export type NotificationChannel = {
  id: string;
  type: NotificationChannelType;
  config: unknown;
};

/** The incident state-change a dispatcher is being asked to announce.
 * `project` is included alongside `incident` because a channel message
 * needs to say *what* is affected, not just *that something is* -- and
 * `notifier.ts`'s own queries already have both in hand, so dispatchers
 * don't need a second round trip to look the project up themselves. */
export type NotificationEvent = {
  kind: "opened" | "resolved";
  project: { id: string; name: string };
  incident: {
    id: string;
    started_at: string;
    resolved_at: string | null;
    cause: string | null;
  };
};

/** Result of one dispatch attempt to one channel. Never throws across this
 * boundary -- see each dispatcher's own contract note below -- so
 * `notifier.ts` can treat every channel uniformly (isolate one channel's
 * failure from another's, #40's own acceptance criterion) without a
 * try/catch per channel type. */
export type DispatchResult = { ok: true } | { ok: false; error: string };

/**
 * One channel type's implementation: given a channel's own config and the
 * event to announce, attempts delivery and reports the outcome. Contract:
 * - Must never throw -- a malformed `config`, a network failure, a non-2xx
 *   response from the third-party API, etc. are all reported as
 *   `{ ok: false, error }`, not an exception, so one bad channel config
 *   can't take down dispatch to every other channel/project in the same
 *   notifier run (mirrors persist.ts/self-monitor.ts's own "never throws,
 *   report the error" convention elsewhere in this codebase).
 * - Must not retry internally -- `notifier.ts` owns the retry story (a
 *   failed dispatch leaves the incident's own notified/resolved_notified
 *   flag false, so it's naturally retried on this dispatcher's next
 *   scheduled run; see notifier.ts's own module comment for why this is a
 *   single best-effort attempt per invocation, not exponential backoff
 *   inside the dispatcher itself).
 */
export type ChannelDispatcher = (
  channel: NotificationChannel,
  event: NotificationEvent,
) => Promise<DispatchResult>;

/** The full plugin registry -- `notifier.ts` looks up a channel's
 * dispatcher by `type` here and never needs to know anything else about
 * how a given channel type actually delivers a message. The Resend API key
 * is read exactly once here, at module load (via `readEnv` above) -- see
 * email.ts's own top comment for why it's threaded in as a parameter
 * rather than read inside the dispatcher itself (testability, and "exactly
 * one place in the codebase reads the raw secret"). If a future channel
 * type is added without a real implementation ready yet, reintroduce a
 * small `notYetImplemented(issueRef)` helper here (removed once #41/#43/
 * #44 all shipped, since nothing used it anymore) rather than leaving a
 * type unregistered. */
export const DISPATCHERS: Record<NotificationChannelType, ChannelDispatcher> = {
  discord: dispatchDiscord,
  webhook: dispatchWebhook,
  email: createEmailDispatcher(readEnv("RESEND_API_KEY"), readEnv("RESEND_FROM_ADDRESS")),
};
