// Digest mode orchestration (PRD §5.5, Phase 6, #46): for one cadence
// ("daily" or "weekly"), finds every user with at least one matching
// `digest_only` notification rule, compiles their whole portfolio's health
// over that cadence's period, and emails it via #44's Resend integration.
//
// Trigger model: two wall-clock `pg_cron` schedules (see
// schedule_digest_cron), not the prober/notifier's 1-minute poll -- see
// that migration's own comment for why a due-work poll doesn't fit a
// "send once a day/week" job.
//
// Recipient resolution deliberately does NOT reuse the prober/notifier's
// per-project-rule model directly: #46's own acceptance criterion is
// "portfolio-level, not one email per project" -- a user is either "in" for
// this cadence (has >=1 matching digest_only rule) or not, and once they're
// in, the email covers *every* active project they own, including ones
// with no digest_only rule attached at all (get_user_portfolio_summary
// takes no rule-based filter, only p_user_id). This is why recipient
// resolution (get_digest_recipients) and portfolio content
// (get_user_portfolio_summary) are two separate SQL functions/RPC calls
// rather than one combined query -- they answer two genuinely different
// questions ("who gets a digest" vs "what goes in it").
//
// Multiple destination addresses: get_digest_recipients can return more
// than one (user_id, to_email) pair for the same user (e.g. digest_only
// rules on two different projects pointing at two different email
// channels) -- each pair gets its own, independently-sent digest email
// covering the *same* full portfolio. This is a deliberate simplification,
// not a bug: deduping to "one email per user" would need a policy for
// which of several possibly-different addresses wins, which the schema has
// no basis to decide.
//
// Idempotency: none, by design -- same reasoning as notifier's own lack of
// an overlap lock (see schedule_digest_cron's comment). A digest email has
// no analogue to `incidents.notified` to mark; an occasional duplicate from
// a cron misfire is a minor, self-healing annoyance.

import { createDigestEmailSender, buildDigestEmailContent, type DigestEmailSender } from "./email.ts";

export type DigestFrequency = "daily" | "weekly";

/** How many hours back a digest's uptime%/incident-count window covers,
 * per cadence -- the digest's own period is its cadence's own length (a
 * daily digest reports on the last 24h, a weekly one on the last 7 days),
 * not a fixed dashboard-style window. */
export const PERIOD_HOURS: Record<DigestFrequency, number> = {
  daily: 24,
  weekly: 24 * 7,
};

export type DigestRecipient = { user_id: string; to_email: string };

/** One project row from `get_user_portfolio_summary`, exactly as returned
 * by that RPC -- see the create_digest_functions migration for the exact
 * query this mirrors. */
export type PortfolioProject = {
  project_id: string;
  project_name: string;
  last_status: string | null;
  last_checked_at: string | null;
  uptime_percentage: number | null;
  incident_count: number;
};

/** The minimal shape this module needs from a Supabase client -- same
 * narrow, structural, `PromiseLike`-not-`Promise` convention as
 * notifier.ts's own `NotifierClient` (testable against a fake, no real SDK
 * needed). Both RPCs are service_role-only (see create_digest_functions'
 * own top comment) -- this client type is never meant to be satisfied by
 * anything but `ctx.supabaseAdmin`. */
export type DigestClient = {
  rpc(
    fn: "get_digest_recipients",
    args: { p_frequency: string },
  ): PromiseLike<{ data: DigestRecipient[] | null; error: { message: string } | null }>;
  rpc(
    fn: "get_user_portfolio_summary",
    args: { p_user_id: string; p_period_hours: number },
  ): PromiseLike<{ data: PortfolioProject[] | null; error: { message: string } | null }>;
};

/** Per-recipient send outcome, surfaced in the Edge Function's own JSON
 * response for observability -- failures are also `console.error`-logged
 * as they happen (see below). */
export type DigestSendOutcome = { to_email: string; ok: boolean; error?: string };

export type DigestRunSummary = {
  frequency: DigestFrequency;
  recipients: number;
  sent: number;
  failed: DigestSendOutcome[];
  errors: string[];
};

/**
 * Sends one recipient's digest: loads their portfolio for the cadence's
 * period and emails it. Isolated in its own function (not inlined in
 * `runDigest`'s loop) so a single recipient's lookup/send failure surfaces
 * as one failed outcome, not a thrown exception that would abort every
 * other recipient in the same `Promise.all` (#46's own "one broken
 * recipient doesn't block another" requirement, mirroring notifier.ts's
 * own per-channel isolation).
 */
async function sendRecipientDigest(
  supabase: DigestClient,
  sendEmail: DigestEmailSender,
  frequency: DigestFrequency,
  recipient: DigestRecipient,
): Promise<DigestSendOutcome> {
  const { data: projects, error: portfolioError } = await supabase.rpc(
    "get_user_portfolio_summary",
    { p_user_id: recipient.user_id, p_period_hours: PERIOD_HOURS[frequency] },
  );

  if (portfolioError) {
    return { to_email: recipient.to_email, ok: false, error: portfolioError.message };
  }

  const content = buildDigestEmailContent(frequency, projects ?? []);
  const result = await sendEmail(recipient.to_email, content);

  return result.ok
    ? { to_email: recipient.to_email, ok: true }
    : { to_email: recipient.to_email, ok: false, error: result.error };
}

/**
 * Finds every digest recipient for `frequency` and sends each their
 * portfolio digest -- the digest job's own entry point, called once per
 * scheduled run (see index.ts). A cadence with zero matching digest_only
 * rules resolves to an empty recipient list, not an error (#46's own "a
 * user with no digest_only rules configured receives no digest email"
 * acceptance criterion) -- this also means nobody's `digest_only` rule
 * pointing at a Discord/webhook channel ever produces a digest send
 * attempt, since get_digest_recipients only ever returns `type = 'email'`
 * channels (there is no non-email digest delivery in v1, per this issue's
 * own "via #44's email channel" scoping).
 */
export async function runDigest(
  supabase: DigestClient,
  frequency: DigestFrequency,
  sendEmail: DigestEmailSender = createDigestEmailSender(readEnv("RESEND_API_KEY"), readEnv("RESEND_FROM_ADDRESS")),
): Promise<DigestRunSummary> {
  const { data: recipients, error: recipientsError } = await supabase.rpc("get_digest_recipients", {
    p_frequency: frequency,
  });

  const errors: string[] = [];
  if (recipientsError) {
    errors.push(`failed to load digest recipients: ${recipientsError.message}`);
  }

  const outcomes = await Promise.all(
    (recipients ?? []).map((recipient) => sendRecipientDigest(supabase, sendEmail, frequency, recipient)),
  );

  const failed = outcomes.filter((outcome) => !outcome.ok);
  for (const outcome of failed) {
    console.error(`[digest] ${frequency} send failed for ${outcome.to_email}: ${outcome.error}`);
  }

  return {
    frequency,
    recipients: recipients?.length ?? 0,
    sent: outcomes.length - failed.length,
    failed,
    errors,
  };
}

/** Same `Deno.env.get` permission-safe wrapper as notifier/dispatch.ts's
 * own `readEnv` (duplicated, not imported -- see this module's top comment
 * on why). */
function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}
