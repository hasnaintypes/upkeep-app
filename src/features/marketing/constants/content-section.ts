import type { ContentRow } from "../types";

export const CONTENT_SECTION_CONTENT = {
  eyebrow: "Incident tracking",
  heading: "Every incident, remembered - not re-discovered",
  description:
    "When a project goes down between checks, you usually find out the hard way - a recruiter mentions a broken demo, or you stumble onto it yourself. By then there's no record of when it started or what happened. Upkeep groups consecutive failed checks into a single incident and keeps the full history attached to the project.",
};

export const CONTENT_ROWS: [ContentRow, ContentRow] = [
  {
    title: "Automatic incident grouping",
    description:
      "Consecutive down or degraded checks become one incident record, not disconnected rows scattered across a host's own logs.",
  },
  {
    title: "Status-change alerts",
    description:
      "Get notified the moment a project's status actually changes, not on every single check - one alert per incident instead of a flood.",
  },
];
