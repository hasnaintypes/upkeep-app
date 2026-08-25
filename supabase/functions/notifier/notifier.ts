// Notifier orchestration (PRD §5.5, Phase 6, #40): finds incidents whose
// open or resolve transition hasn't been announced yet, resolves each
// affected project's configured channels, and dispatches through the
// plugin contract in dispatch.ts.
//
// Trigger model: a scheduled poll of the `incidents` table itself (own
// `pg_cron` tick, see the schedule_notifier_cron migration), not a
// fire-and-forget call wedged into the prober's own request lifecycle.
// Deliberately decoupled from the prober for three reasons: (1) the
// acceptance criteria's own "sourced from the same incident-detection path
// Phase 5 writes... not polled independently from raw checks rows" is
// satisfied either way -- this polls `incidents` (Phase 5's own output),
// never `checks` -- so decoupling doesn't violate it; (2) a notifier bug or
// a slow/failing third-party API (Discord rate limits, an SMTP timeout)
// can't add latency or failure risk to the prober's own critical tick path;
// (3) retries come for free -- an incident whose dispatch attempt failed
// simply stays `notified: false`/`resolved_notified: false` and gets
// re-attempted on this function's next scheduled run, with no separate
// backoff/queue mechanism needed.
//
// Idempotency: `notified` (open transition) and `resolved_notified`
// (resolve transition) are independent flags on the same `incidents` row
// (see the add_notification_mute_and_resolved_notified migration) --a
// short-lived incident that opens and then auto-resolves before this
// function's next run still gets *both* notifications sent, since both are
// genuine, distinct state changes per PRD §5.5's "notification on status
// change only."
//
// Retry policy: exactly one best-effort dispatch attempt per transition per
// run, deliberately not per-channel exponential backoff. A channel's own
// dispatch failure is logged (see dispatch.ts's `ChannelDispatcher`
// contract) but the incident is still marked notified/resolved_notified
// after that single attempt -- an indefinitely-retried, permanently-broken
// channel config would otherwise spam every subsequent notifier run
// forever with the same failure. This is a deliberate, documented v1
// scope decision, not an oversight -- revisit if per-channel retry/backoff
// becomes a real product need later.
//
// escalation_threshold scope (v1): `project_notification_rules
// .escalation_threshold` ("consecutive failures before alert") is
// independent from the prober's own fixed incident-open threshold
// (`incidents.ts`'s `ESCALATION_THRESHOLD`, #35) -- there is no mechanism
// today to track a longer failure streak *past* the moment an incident
// opens (`maybeOpenIncident` only ever fires once per incident, never
// re-evaluates a longer-running one). A rule only fires on the open
// transition if its own `escalation_threshold` is at or below the
// incident's fixed open-threshold, which every incident is guaranteed to
// have reached by construction. A rule configured with a higher threshold
// is a known, documented v1 limitation (it would need new prober-side
// streak tracking to support true delayed escalation) -- it's skipped
// silently at the eligibility-filtering stage below, not treated as an
// error.

import { DISPATCHERS, type ChannelDispatcher, type NotificationChannel, type NotificationChannelType, type NotificationEvent } from "./dispatch.ts";

/** Mirrors `ESCALATION_THRESHOLD` in `supabase/functions/prober/incidents.ts`
 * (#35) -- duplicated, not imported, since each Supabase Edge Function is
 * its own independent deployment unit with no shared-code mechanism across
 * function directories (`notifier` and `prober` can't import from each
 * other's files). Both represent the same product decision (N=2 consecutive
 * down/degraded checks), so keep this value in sync with prober's own copy
 * if that decision ever changes. */
const ESCALATION_THRESHOLD = 2;

type IncidentTransitionKind = "opened" | "resolved";

/** One incident row as `runNotifier`'s own queries need it -- a subset of
 * the full `incidents` row, matching `RecentCheck`/`Incident`'s own
 * "narrow, only what this module needs" convention elsewhere in this
 * codebase. */
export type NotifiableIncident = {
  id: string;
  project_id: string;
  started_at: string;
  resolved_at: string | null;
  cause: string | null;
};

/** One `project_notification_rules` row joined with its channel, exactly
 * as `resolveEligibleChannels` needs it. `notification_channels` embeds as
 * a single nested object (a rule has exactly one channel via `channel_id`,
 * a to-one relationship) -- `| null` only for a channel deleted out from
 * under a rule in the narrow window before the rule's own cascading
 * delete lands (see the create_project_notification_rules_table
 * migration's `on delete cascade` on `channel_id`), not an expected
 * steady-state value. */
export type NotificationRuleWithChannel = {
  escalation_threshold: number;
  is_muted: boolean;
  digest_only: boolean;
  notification_channels: {
    id: string;
    type: NotificationChannelType;
    config: unknown;
    is_active: boolean;
  } | null;
};

/** The minimal shape this module needs from a Supabase client -- same
 * narrow, structural, `PromiseLike`-not-`Promise` convention as
 * `incidents.ts`'s own `IncidentClient` (see persist.ts's `InsertableClient`
 * comment for why `PromiseLike`): testable against a fake without the real
 * SDK, and avoids typing the full postgrest-js generic for query shapes
 * this module doesn't otherwise need. */
export type NotifierClient = {
  from(table: "incidents"): {
    select(columns: string): {
      eq(
        column: string,
        value: boolean,
      ): {
        order(
          column: string,
          opts: { ascending: boolean },
        ): {
          limit(n: number): PromiseLike<{
            data: NotifiableIncident[] | null;
            error: { message: string } | null;
          }>;
        };
      };
      not(
        column: string,
        operator: string,
        value: null,
      ): {
        eq(
          column: string,
          value: boolean,
        ): {
          order(
            column: string,
            opts: { ascending: boolean },
          ): {
            limit(n: number): PromiseLike<{
              data: NotifiableIncident[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
  from(table: "projects"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { id: string; name: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  from(table: "project_notification_rules"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{
        data: NotificationRuleWithChannel[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** How many un-notified transitions one `runNotifier` invocation processes
 * at most, per direction (open/resolve) -- generous headroom against this
 * app's expected scale (~50 projects, PRD §9); any excess simply stays
 * unnotified and gets picked up on the function's next scheduled run
 * (see this module's own top comment on the self-healing retry model). */
const NOTIFIER_BATCH_LIMIT = 50;

const NOTIFICATION_RULE_COLUMNS =
  "escalation_threshold, is_muted, digest_only, notification_channels(id, type, config, is_active)";

/** Every non-muted, non-digest-only rule for `projectId` whose channel is
 * active and whose own `escalation_threshold` the incident's fixed
 * open-threshold already satisfies (see this module's own top comment on
 * why `escalation_threshold` is compared against `ESCALATION_THRESHOLD`,
 * not a per-incident streak length that isn't tracked anywhere). */
async function resolveEligibleChannels(
  supabase: NotifierClient,
  projectId: string,
): Promise<{ channels: NotificationChannel[]; error: string | null }> {
  const { data, error } = await supabase
    .from("project_notification_rules")
    .select(NOTIFICATION_RULE_COLUMNS)
    .eq("project_id", projectId);

  if (error) {
    return { channels: [], error: error.message };
  }

  const channels = (data ?? [])
    .filter(
      (rule) =>
        !rule.is_muted &&
        !rule.digest_only &&
        rule.escalation_threshold <= ESCALATION_THRESHOLD &&
        rule.notification_channels?.is_active,
    )
    .map((rule) => rule.notification_channels!);

  return { channels, error: null };
}

/** Per-channel dispatch outcome for one incident transition, surfaced back
 * to the caller for observability (the Edge Function's own JSON response)
 * -- failures are also `console.error`-logged as they happen (see below),
 * this is the structured summary on top of that. */
export type IncidentDispatchOutcome = {
  incidentId: string;
  kind: IncidentTransitionKind;
  attempted: number;
  failed: { channelId: string; error: string }[];
};

/**
 * Resolves the project + eligible channels for one incident transition and
 * dispatches to each, in parallel, isolating one channel's failure from
 * every other (#40's own acceptance criterion) via `Promise.all` over
 * per-channel results rather than a loop that could throw partway through.
 * Marks the incident's own idempotency flag afterward regardless of
 * per-channel outcome (see this module's top comment on the single-
 * best-effort-attempt retry policy) -- the only case that does *not* mark
 * the flag is a failure to even determine the eligible channel set (the
 * project/rules lookup itself erroring), since that's a transient
 * infrastructure failure worth retrying wholesale on the next run, not a
 * per-channel delivery failure.
 */
async function dispatchIncidentTransition(
  supabase: NotifierClient,
  dispatchers: Record<NotificationChannelType, ChannelDispatcher>,
  incident: NotifiableIncident,
  kind: IncidentTransitionKind,
): Promise<IncidentDispatchOutcome | { error: string }> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", incident.project_id)
    .maybeSingle();

  if (projectError) {
    return { error: projectError.message };
  }
  if (!project) {
    // A project's own `on delete cascade` (create_incidents_table
    // migration) means its incidents are deleted alongside it -- this
    // should be unreachable in steady state, but treated as a lookup
    // failure (retry next run) rather than silently dropping the
    // transition, in case of a narrow mid-transaction window.
    return { error: `project ${incident.project_id} not found` };
  }

  const { channels, error: channelsError } = await resolveEligibleChannels(
    supabase,
    incident.project_id,
  );
  if (channelsError) {
    return { error: channelsError };
  }

  const event: NotificationEvent = {
    kind,
    project,
    incident: {
      id: incident.id,
      started_at: incident.started_at,
      resolved_at: incident.resolved_at,
      cause: incident.cause,
    },
  };

  const results = await Promise.all(
    channels.map(async (channel) => ({
      channel,
      result: await dispatchers[channel.type](channel, event),
    })),
  );

  const failed = results
    .filter(({ result }) => !result.ok)
    .map(({ channel, result }) => ({
      channelId: channel.id,
      error: (result as { ok: false; error: string }).error,
    }));

  for (const { channelId, error } of failed) {
    console.error(
      `[notifier] dispatch failed for incident ${incident.id} (${kind}), channel ${channelId}: ${error}`,
    );
  }

  const notifiedColumn = kind === "opened" ? "notified" : "resolved_notified";
  const { error: updateError } = await supabase
    .from("incidents")
    .update({ [notifiedColumn]: true })
    .eq("id", incident.id);

  if (updateError) {
    console.error(
      `[notifier] failed to mark incident ${incident.id} as ${notifiedColumn}: ${updateError.message}`,
    );
  }

  return { incidentId: incident.id, kind, attempted: channels.length, failed };
}

export type NotifierRunSummary = {
  opened: IncidentDispatchOutcome[];
  resolved: IncidentDispatchOutcome[];
  errors: string[];
};

/**
 * Finds every incident whose open or resolve transition hasn't been
 * announced yet and dispatches for each -- the notifier's own entry point,
 * called once per scheduled run (see index.ts). A project with no
 * notification rules configured resolves to an empty eligible-channel set
 * (`resolveEligibleChannels` returns `[]`, not an error) and produces a
 * zero-attempt outcome, not a dispatch attempt or an error (#40's own
 * acceptance criterion).
 */
export async function runNotifier(
  supabase: NotifierClient,
  dispatchers: Record<NotificationChannelType, ChannelDispatcher> = DISPATCHERS,
): Promise<NotifierRunSummary> {
  const [openedQuery, resolvedQuery] = await Promise.all([
    supabase
      .from("incidents")
      .select("id, project_id, started_at, resolved_at, cause")
      .eq("notified", false)
      .order("started_at", { ascending: true })
      .limit(NOTIFIER_BATCH_LIMIT),
    supabase
      .from("incidents")
      .select("id, project_id, started_at, resolved_at, cause")
      .not("resolved_at", "is", null)
      .eq("resolved_notified", false)
      .order("resolved_at", { ascending: true })
      .limit(NOTIFIER_BATCH_LIMIT),
  ]);

  const errors: string[] = [];
  if (openedQuery.error) {
    errors.push(`failed to load incidents needing open-notification: ${openedQuery.error.message}`);
  }
  if (resolvedQuery.error) {
    errors.push(
      `failed to load incidents needing resolve-notification: ${resolvedQuery.error.message}`,
    );
  }

  const [openedOutcomes, resolvedOutcomes] = await Promise.all([
    Promise.all(
      (openedQuery.data ?? []).map((incident) =>
        dispatchIncidentTransition(supabase, dispatchers, incident, "opened"),
      ),
    ),
    Promise.all(
      (resolvedQuery.data ?? []).map((incident) =>
        dispatchIncidentTransition(supabase, dispatchers, incident, "resolved"),
      ),
    ),
  ]);

  const opened: IncidentDispatchOutcome[] = [];
  for (const outcome of openedOutcomes) {
    if ("error" in outcome) {
      errors.push(`opened-notification for an incident failed: ${outcome.error}`);
    } else {
      opened.push(outcome);
    }
  }

  const resolved: IncidentDispatchOutcome[] = [];
  for (const outcome of resolvedOutcomes) {
    if ("error" in outcome) {
      errors.push(`resolved-notification for an incident failed: ${outcome.error}`);
    } else {
      resolved.push(outcome);
    }
  }

  return { opened, resolved, errors };
}
