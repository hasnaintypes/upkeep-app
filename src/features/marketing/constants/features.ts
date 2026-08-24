import type { FeatureCard } from "../types";

export const FEATURES_CONTENT = {
  eyebrow: "Platform Features",
  headingLead: "Everything you need,",
  headingRest: "at one place!",
  description:
    "Upkeep pings each project's health endpoint on its own schedule, classifies what it finds, and keeps a live status board so you're never the last to know something's down.",
};

export const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Flexible checks",
    description:
      "Set the method, expected status, interval, and timeout per project - plus custom headers and a request body for endpoints that need them.",
    icon: "checks",
  },
  {
    title: "Smart classification",
    description:
      "Every ping is sorted into up, degraded, waking, down, or unknown, so a cold start never gets mistaken for an outage.",
    icon: "status",
  },
  {
    title: "Live dashboard",
    description:
      "Rolling 24h/7d/30d/90d uptime and response-time trends for every project, in one status board.",
    icon: "dashboard",
  },
  {
    title: "Fast detection",
    description:
      "Checked on a tight enough interval that most incidents are caught in under 5 minutes, not discovered by a visitor.",
    icon: "speed",
  },
];
