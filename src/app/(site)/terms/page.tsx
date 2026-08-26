import type { Metadata } from "next";
import { BRAND_NAME, GITHUB_URL } from "@/features/marketing";

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND_NAME}`,
  description: `The terms for using ${BRAND_NAME}.`,
};

const LAST_UPDATED = "August 26, 2026";

export default function TermsPage() {
  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
          Legal
        </p>
        <h1 className="text-foreground mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Terms of Service
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Last updated {LAST_UPDATED}
        </p>

        <div className="mt-12 space-y-10">
          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Using {BRAND_NAME}</h2>
            <p className="text-muted-foreground">
              {BRAND_NAME} is a self-hosted uptime and health monitor for
              personal and portfolio projects. By creating an account on this
              instance, you agree to these terms. If you don&apos;t agree, don&apos;t
              use it — you&apos;re also free to run your own instance under your
              own terms, since {BRAND_NAME} is open source.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">
              Only monitor what&apos;s yours
            </h2>
            <p className="text-muted-foreground">
              Only register health-check URLs for projects you own or have
              explicit permission to monitor. {BRAND_NAME} sends scheduled HTTP
              requests to every URL you add — pointing it at endpoints you
              don&apos;t control, without permission, is not an authorized use of
              this service.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Your account</h2>
            <p className="text-muted-foreground">
              You&apos;re responsible for keeping your login credentials and any
              API keys you generate confidential, and for anything that happens
              under your account. Let us know on GitHub if you think your
              account has been compromised.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">
              No uptime guarantee
            </h2>
            <p className="text-muted-foreground">
              {BRAND_NAME} is provided as-is, run on a free-tier infrastructure
              budget, with no uptime SLA or guarantee of continuous
              availability. Checks, alerts, and keep-alive pings are best-effort
              — don&apos;t rely on this instance as your only safeguard for
              anything mission-critical.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">
              Fair use of the prober
            </h2>
            <p className="text-muted-foreground">
              Check intervals and timeouts exist to keep {BRAND_NAME} within its
              own hosting limits and to avoid overloading the projects it
              monitors. We may throttle or disable checks for a project that
              sets an unreasonably aggressive interval or otherwise strains the
              service.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">
              Termination
            </h2>
            <p className="text-muted-foreground">
              You can delete your account and all associated data at any time
              from the dashboard. We may suspend or remove an account that
              violates these terms, in particular the monitoring-permission
              rule above.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-foreground text-xl font-semibold">Changes</h2>
            <p className="text-muted-foreground">
              These terms may change as {BRAND_NAME} evolves. Material changes
              will be reflected here with an updated date. Continuing to use
              the service after a change means you accept the updated terms.
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
