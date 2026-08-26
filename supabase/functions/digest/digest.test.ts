// Unit tests for digest.ts, using a fake DigestClient and a fake email
// sender -- no real Supabase project, Resend account, or network access
// required (same convention as ../notifier/notifier.test.ts).
import { assertEquals } from "@std/assert";
import { PERIOD_HOURS, runDigest, type DigestClient, type DigestRecipient, type PortfolioProject } from "./digest.ts";
import type { DigestEmailSender, DigestSendResult } from "./email.ts";

function fakeRecipient(overrides: Partial<DigestRecipient> = {}): DigestRecipient {
  return { user_id: "user-1", to_email: "me@example.test", ...overrides };
}

function fakeProject(overrides: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    project_id: "project-1",
    project_name: "Portfolio Site",
    last_status: "up",
    last_checked_at: "2026-08-26T00:00:00.000Z",
    uptime_percentage: 100,
    incident_count: 0,
    ...overrides,
  };
}

/** A configurable fake DigestClient -- mirrors notifier.test.ts's own
 * `fakeClient` factory (canned data per RPC, keyed by args when a test
 * needs per-recipient portfolios). `rpc` is overloaded by function name in
 * DigestClient's real type; this fake dispatches on `fn` at runtime and
 * casts through `unknown` rather than trying to satisfy both call
 * signatures structurally. */
function fakeDigestClient(options: {
  recipients?: DigestRecipient[];
  recipientsError?: string;
  portfoliosByUserId?: Record<string, PortfolioProject[]>;
  portfolioError?: string;
}): DigestClient {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "get_digest_recipients") {
        return Promise.resolve(
          options.recipientsError
            ? { data: null, error: { message: options.recipientsError } }
            : { data: options.recipients ?? [], error: null },
        );
      }
      if (fn === "get_user_portfolio_summary") {
        if (options.portfolioError) {
          return Promise.resolve({ data: null, error: { message: options.portfolioError } });
        }
        const userId = args.p_user_id as string;
        return Promise.resolve({ data: options.portfoliosByUserId?.[userId] ?? [], error: null });
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  } as unknown as DigestClient;
}

function fakeSendEmail(
  options: { fail?: boolean; error?: string } = {},
): { send: DigestEmailSender; calls: { to: string; subject: string }[] } {
  const calls: { to: string; subject: string }[] = [];
  const send: DigestEmailSender = (to, content) => {
    calls.push({ to, subject: content.subject });
    const result: DigestSendResult = options.fail
      ? { ok: false, error: options.error ?? "send failed" }
      : { ok: true };
    return Promise.resolve(result);
  };
  return { send, calls };
}

Deno.test("runDigest: no matching digest_only rules -> zero recipients, no send attempted", async () => {
  const client = fakeDigestClient({ recipients: [] });
  const { send, calls } = fakeSendEmail();

  const summary = await runDigest(client, "daily", send);

  assertEquals(summary.recipients, 0);
  assertEquals(summary.sent, 0);
  assertEquals(calls.length, 0);
});

Deno.test("runDigest: one recipient -> sends one portfolio-wide email, covering every returned project", async () => {
  const client = fakeDigestClient({
    recipients: [fakeRecipient()],
    portfoliosByUserId: {
      "user-1": [
        fakeProject({ project_id: "p1", project_name: "Site A" }),
        fakeProject({ project_id: "p2", project_name: "Site B" }),
      ],
    },
  });
  const { send, calls } = fakeSendEmail();

  const summary = await runDigest(client, "daily", send);

  assertEquals(summary.recipients, 1);
  assertEquals(summary.sent, 1);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].to, "me@example.test");
});

Deno.test("runDigest: passes the cadence's own period hours to get_user_portfolio_summary", async () => {
  const capturedArgs: Record<string, unknown>[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "get_digest_recipients") {
        return Promise.resolve({ data: [fakeRecipient()], error: null });
      }
      capturedArgs.push(args);
      return Promise.resolve({ data: [], error: null });
    },
  } as unknown as DigestClient;
  const { send } = fakeSendEmail();

  await runDigest(client, "weekly", send);

  assertEquals(capturedArgs[0].p_period_hours, PERIOD_HOURS.weekly);
});

Deno.test("runDigest: multiple recipients -> one failed send doesn't block another's", async () => {
  const client = fakeDigestClient({
    recipients: [fakeRecipient({ to_email: "ok@example.test" }), fakeRecipient({ to_email: "broken@example.test" })],
    portfoliosByUserId: { "user-1": [fakeProject()] },
  });

  let call = 0;
  const send: DigestEmailSender = (to) => {
    call += 1;
    return Promise.resolve(
      to === "broken@example.test" ? { ok: false, error: "resend down" } : { ok: true },
    );
  };

  const summary = await runDigest(client, "daily", send);

  assertEquals(call, 2);
  assertEquals(summary.sent, 1);
  assertEquals(summary.failed.length, 1);
  assertEquals(summary.failed[0].to_email, "broken@example.test");
});

Deno.test("runDigest: get_digest_recipients failure -> surfaced in errors, zero send attempts", async () => {
  const client = fakeDigestClient({ recipientsError: "connection reset" });
  const { send, calls } = fakeSendEmail();

  const summary = await runDigest(client, "daily", send);

  assertEquals(summary.errors.some((e) => e.includes("connection reset")), true);
  assertEquals(calls.length, 0);
});

Deno.test("runDigest: get_user_portfolio_summary failure for one recipient -> reported as a failed outcome, not thrown", async () => {
  const client = fakeDigestClient({
    recipients: [fakeRecipient()],
    portfolioError: "permission denied",
  });
  const { send } = fakeSendEmail();

  const summary = await runDigest(client, "daily", send);

  assertEquals(summary.sent, 0);
  assertEquals(summary.failed.length, 1);
  assertEquals(summary.failed[0].error, "permission denied");
});

Deno.test("runDigest: a recipient with zero active projects still gets a confirming digest, not a skipped send", async () => {
  const client = fakeDigestClient({
    recipients: [fakeRecipient()],
    portfoliosByUserId: { "user-1": [] },
  });
  const { send, calls } = fakeSendEmail();

  const summary = await runDigest(client, "daily", send);

  assertEquals(summary.sent, 1);
  assertEquals(calls.length, 1);
});
