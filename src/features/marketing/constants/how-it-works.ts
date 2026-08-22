import type { HowItWorksStep } from "../types";

export const HOW_IT_WORKS_CONTENT = {
  heading: "From registered URL to live status in four steps",
  description:
    "No agent to install on your projects - just a health endpoint and a schedule.",
};

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    title: "Register a project",
    description:
      "Add a name, health check URL, expected status code, and check interval - or self-register it via the API at deploy time.",
  },
  {
    title: "Upkeep pings on schedule",
    description:
      "A scheduled prober checks each project on its own interval, classifies the result as up, down, degraded, or waking, and retries before marking it down.",
  },
  {
    title: "Get notified on status change",
    description:
      "Alerts fire only when a project's status actually changes - Discord, Telegram, email, or a webhook of your choice.",
  },
  {
    title: "Track history on one dashboard",
    description:
      "Rolling uptime percentages, response-time trends, and grouped incident history for every project.",
  },
];
