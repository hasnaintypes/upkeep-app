import type { FeatureCard } from "../types";

export const FEATURES_CONTENT = {
  heading: "Always-on monitoring, without babysitting dashboards",
  description:
    "Upkeep pings each project's health endpoint on its own schedule, classifies what it finds, and keeps a live status board so you're never the last to know something's down.",
};

export const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Continuous health checks",
    description:
      "Configurable interval, timeout, and retries per project - with every check classified as up, down, degraded, or waking from a cold start.",
    illustration: "code",
  },
  {
    title: "Keep-alive scheduling",
    description:
      "Ping free-tier hosts often enough to prevent idle spin-down, so demo links stay warm exactly when you need them to be.",
    illustration: "schedule",
  },
];

/** Status classification list shown in the decorative code illustration. */
export const CODE_ILLUSTRATION_CONTENT = {
  items: ["up", "degraded", "waking", "down", "unknown"],
  /** Index into `items` that gets the highlighted "Cold start" annotation. */
  highlightedIndex: 2,
  highlightedTag: "Cold start",
};

export const SCHEDULE_ILLUSTRATION_CONTENT = {
  toolbarLabel: "Check now",
  highlight: "Every 5 min",
  suffix: "is our default interval.",
};
