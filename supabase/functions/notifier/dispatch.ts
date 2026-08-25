// Notification channel dispatch contract (PRD §5.5/§5.10, Phase 6, #40):
// the plugin-style interface every channel type (Discord #41, Telegram #42,
// generic webhook #43, email #44) implements independently against, so
// `notifier.ts`'s own orchestration logic never branches on channel type
// itself -- adding a new channel type is "write one function matching
// `ChannelDispatcher` and register it below", not "add a new `if` branch
// inside the notifier's core loop" (PRD §5.10's own plugin-architecture
// wording).
//
// #40's own scope is this contract plus the routing/orchestration that
// decides *which* channels get an event (see notifier.ts) -- not the real
// channel integrations themselves, which are each their own follow-up
// issue. Every dispatcher below is a documented stub that reports itself as
// not yet implemented rather than silently pretending to succeed (a stub
// that returned `{ ok: true }` would make a real, un-sent notification
// indistinguishable from a genuinely delivered one).

/** One `notification_channels` row, exactly as dispatchers need it -- `type`
 * narrowed to the four values the table's own check constraint allows
 * (see the create_notification_channels_table migration), `config` left as
 * the raw `Json` shape since its actual structure is type-specific (a
 * webhook URL, a bot token + chat id, etc.) and validated by each
 * dispatcher itself, not centrally. */
export type NotificationChannelType = "discord" | "telegram" | "email" | "webhook";

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

/** A stub dispatcher for a channel type that doesn't have a real
 * implementation yet -- reports itself as unimplemented rather than
 * silently succeeding (see this module's own top comment for why "fake
 * success" would be worse than an honest, loggable failure) or silently
 * dropping the event with no result at all. Each of #41-#44 replaces its
 * own entry in `DISPATCHERS` below with a real implementation; nothing
 * else in this module changes when that happens. */
function notYetImplemented(issueRef: string): ChannelDispatcher {
  return (channel) =>
    Promise.resolve({
      ok: false,
      error: `channel type "${channel.type}" is not implemented yet (see ${issueRef})`,
    });
}

/** The full plugin registry -- `notifier.ts` looks up a channel's
 * dispatcher by `type` here and never needs to know anything else about
 * how a given channel type actually delivers a message. */
export const DISPATCHERS: Record<NotificationChannelType, ChannelDispatcher> = {
  discord: notYetImplemented("#41"),
  telegram: notYetImplemented("#42"),
  webhook: notYetImplemented("#43"),
  email: notYetImplemented("#44"),
};
