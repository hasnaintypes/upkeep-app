import { Bell, LayoutDashboard, LineChart, ListChecks } from "lucide-react";
import type { ContentHighlightIcon } from "../types";
import { CONTENT_HIGHLIGHTS, CONTENT_SECTION_CONTENT } from "../constants/content-section";

const ICONS: Record<ContentHighlightIcon, typeof ListChecks> = {
  "list-checks": ListChecks,
  bell: Bell,
  "layout-dashboard": LayoutDashboard,
  "line-chart": LineChart,
};

export function ContentSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:gap-12">
          <h2 className="max-w-md text-balance text-4xl font-medium tracking-tight lg:text-5xl">
            <span className="text-muted-foreground">
              {CONTENT_SECTION_CONTENT.headingLead}
            </span>{" "}
            <br /> {CONTENT_SECTION_CONTENT.headingRest}
          </h2>
          <div className="space-y-4">
            {CONTENT_SECTION_CONTENT.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground text-balance text-lg">
                {paragraph}
              </p>
            ))}

            <div className="*:not-last:pb-3 *:not-last:border-b mt-20 flex flex-col gap-3 pt-6">
              {CONTENT_HIGHLIGHTS.map((highlight) => {
                const Icon = ICONS[highlight.icon];
                return (
                  <p key={highlight.title} className="text-muted-foreground text-balance text-lg">
                    <span className="text-foreground font-medium">
                      <Icon className="inline size-4 -translate-y-0.5" /> {highlight.title}
                    </span>{" "}
                    {highlight.description}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
