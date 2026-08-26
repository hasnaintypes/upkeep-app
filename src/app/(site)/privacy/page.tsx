import type { Metadata } from "next";
import { BRAND_NAME, GITHUB_URL } from "@/features/marketing";

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} collects, stores, and uses your data.`,
};

const LAST_UPDATED = "August 26, 2026";

export default function PrivacyPage() {
  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
          Legal
        </p>
        <h1 className="text-foreground mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Last updated {LAST_UPDATED}
        </p>

        <div className="mt-12 space-y-10">
          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Who this covers</h2>
            <p className="text-muted-foreground">
              This policy describes what happens to your data when you create an
              account and use this instance of {BRAND_NAME}, a self-hosted uptime
              and health monitor. {BRAND_NAME} is open source — anyone can run
              their own instance on their own Supabase project, and this policy
              only applies to the instance running at this domain.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">What we collect</h2>
            <ul className="text-muted-foreground list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground font-medium">Account details</span> —
                the email address and password (or magic link) you sign up with,
                handled by Supabase Auth.
              </li>
              <li>
                <span className="text-foreground font-medium">Project data you add</span> —
                names, descriptions, health-check URLs, and any custom headers or
                auth tokens you enter so Upkeep can reach your endpoints.
              </li>
              <li>
                <span className="text-foreground font-medium">Check and incident history</span> —
                the results the prober records every time it pings one of your
                projects: status, response time, HTTP code, and error details on
                failure.
              </li>
              <li>
                <span className="text-foreground font-medium">Notification settings</span> —
                the Discord webhook URL, email address, or webhook endpoint you
                configure to receive alerts.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">
              What we don&apos;t do
            </h2>
            <p className="text-muted-foreground">
              We don&apos;t sell your data, share it with advertisers, or use it
              for anything beyond running the monitoring and alerting you set up.
              There&apos;s no third-party analytics or ad tracking on the
              dashboard.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Where it lives</h2>
            <p className="text-muted-foreground">
              Your data is stored in this instance&apos;s Supabase project
              (Postgres), scoped to your account with row-level security so
              other users can&apos;t read it. Session state is kept in
              authentication cookies managed by Supabase Auth — no data is
              persisted client-side beyond that.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">How long we keep it</h2>
            <p className="text-muted-foreground">
              Account and project data is kept for as long as your account
              exists. Raw check history is kept at full detail for a limited
              window and then rolled up into daily/hourly aggregates, so
              individual old check records don&apos;t stick around forever.
              Deleting a project or your account removes its associated data.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Your choices</h2>
            <p className="text-muted-foreground">
              You can edit or delete any project, notification channel, or your
              account at any time from the dashboard. Because {BRAND_NAME} is
              open source, you can also self-host your own instance and keep
              full control of the underlying database yourself.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Questions</h2>
            <p className="text-muted-foreground">
              Open an issue on{" "}
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                className="text-foreground font-medium hover:underline"
              >
                GitHub
              </a>{" "}
              and we&apos;ll get back to you.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
