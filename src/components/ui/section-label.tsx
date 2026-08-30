import type { ReactNode } from "react";

/**
 * Small uppercase eyebrow label marking a logical section within a page
 * (e.g. dashboard overview's "Metrics"/"Activity"/"Projects", or the
 * project detail page's "Monitoring"/"History") -- groups stacked
 * cards/tables under a heading instead of leaving them as an
 * undifferentiated stack. Same "text-xs font-medium tracking-wide uppercase"
 * convention used elsewhere in this app (e.g. the check-target prefix on
 * `ProjectDetailHeader`), pulled out here once it needed to be shared across
 * more than the add-project form it started in.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
  );
}
