import { Bell, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONTENT_ROWS, CONTENT_SECTION_CONTENT } from "../constants/content-section";
import { Reveal } from "./reveal";

export function ContentSection() {
  return (
    <section>
      <div className="bg-muted/50 py-20 lg:py-24">
        <div className="mx-auto w-full max-w-5xl px-6">
          <Reveal>
            <span className="text-primary text-sm font-semibold">
              {CONTENT_SECTION_CONTENT.eyebrow}
            </span>
            <h2 className="text-foreground mt-4 text-4xl font-semibold">
              {CONTENT_SECTION_CONTENT.heading}
            </h2>
            <p className="text-muted-foreground mt-4 mb-12 text-lg text-balance">
              {CONTENT_SECTION_CONTENT.description}
            </p>
          </Reveal>

          <div className="border-foreground/5 space-y-6 [--color-border:color-mix(in_oklab,var(--color-foreground)10%,transparent)] sm:space-y-0 sm:divide-y">
            <Reveal delay={100}>
              <div className="grid sm:grid-cols-5 sm:divide-x">
                <IncidentLifecycleIllustration className="sm:col-span-2" />
                <div className="mt-6 sm:col-span-3 sm:mt-0 sm:border-l sm:pl-12">
                  <h3 className="text-foreground text-xl font-semibold">
                    {CONTENT_ROWS[0].title}
                  </h3>
                  <p className="text-muted-foreground mt-4 text-lg">
                    {CONTENT_ROWS[0].description}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="grid sm:grid-cols-5 sm:divide-x">
                <div className="pt-12 sm:col-span-3 sm:border-r sm:pr-12">
                  <h3 className="text-foreground text-xl font-semibold">
                    {CONTENT_ROWS[1].title}
                  </h3>
                  <p className="text-muted-foreground mt-4 text-lg">
                    {CONTENT_ROWS[1].description}
                  </p>
                </div>
                <div className="row-start-1 flex items-center justify-center pt-12 sm:col-span-2 sm:row-start-auto">
                  <AlertIllustration className="pt-8" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Floating toolbar illustration for the "status-change alerts" row. The
 * original shadcn/Tailark version of this block had a rich-text formatting
 * toggle group (bold/italic/underline/strikethrough) here -- dropped
 * entirely rather than kept-but-relabelled, since text formatting has
 * nothing to do with an uptime monitor's alerting flow. Only the
 * structurally-relevant pieces (a primary action + an overflow menu)
 * survive, re-themed as "send a notification" + "more options".
 */
function AlertIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="bg-background shadow-black-950/10 -translate-x-1/8 absolute flex -translate-y-[110%] items-center gap-2 rounded-lg p-1 shadow-lg">
        <Button size="sm" className="rounded-sm">
          <Bell className="size-3" />
          <span className="text-sm font-medium">Notify</span>
        </Button>
        <span className="bg-border block h-4 w-px" />
        <Button size="icon" className="size-8" variant="ghost">
          <Ellipsis className="size-3" />
        </Button>
      </div>
      <span>
        <span className="bg-secondary text-secondary-foreground py-1">
          Status changed to Down
        </span>{" "}
        - alert sent.
      </span>
    </div>
  );
}

const LIFECYCLE_TERMS = ["Checked", "Down", "Incident", "Notified", "Resolved"];

function IncidentLifecycleIllustration({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "[mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_50%,transparent_100%)]",
        className,
      )}
    >
      <ul className="text-muted-foreground mx-auto w-fit font-mono text-2xl font-medium">
        {LIFECYCLE_TERMS.map((term, index) => (
          <li
            key={term}
            className={cn(
              index === 2 &&
                "text-foreground before:absolute before:-translate-x-[110%] before:text-muted-foreground before:content-['Grouped']",
            )}
          >
            {term}
          </li>
        ))}
      </ul>
    </div>
  );
}
