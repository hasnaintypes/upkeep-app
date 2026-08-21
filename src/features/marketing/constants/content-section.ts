import type { ContentHighlight } from "../types";

export const CONTENT_SECTION_CONTENT = {
  headingLead: "Every incident.",
  headingRest: "Remembered, not re-discovered.",
  paragraphs: [
    "When a project goes down between checks, you usually find out the hard way - a recruiter mentions a broken demo, or you stumble onto it yourself. By then there's no record of when it started or what happened.",
    "Upkeep groups consecutive failed checks into a single incident, keeps the raw history attached to the project, and rolls it all up into one dashboard instead of scattered host logs.",
  ],
};

export const CONTENT_HIGHLIGHTS: ContentHighlight[] = [
  {
    icon: "list-checks",
    title: "Automatic incident grouping.",
    description:
      "Consecutive down or degraded checks become one incident record, not disconnected rows.",
  },
  {
    icon: "bell",
    title: "Status-change alerts.",
    description:
      "Get notified when a project's status actually changes, not on every single check.",
  },
  {
    icon: "layout-dashboard",
    title: "One dashboard.",
    description:
      "Every registered project's live status, in one place instead of N hosting consoles.",
  },
  {
    icon: "line-chart",
    title: "Uptime history.",
    description:
      "Rolling 24h/7d/30d/90d uptime and response-time trends per project.",
  },
];
