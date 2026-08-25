import type { ContentRow, HowItWorksStep } from "../types";

export const HOW_IT_WORKS_CONTENT = {
  eyebrow: "How it works",
  headingLead: "Upkeep, as your",
  headingHighlight: "uptime watchdog",
  headingRest:
    ", pings every project's health endpoint on its own schedule, classifies what it finds, and alerts you the moment something changes.",
  primaryCta: "Get started free",
  secondaryCta: "View on GitHub",
  stepsEyebrow: "Step by step",
};

/** The compact 2x2 capability grid next to the intro copy -- the same
 * real facts used elsewhere on this page (checks, classification,
 * notification channels, self-hosting cost), just condensed to one line
 * each for this layout. */
export const HOW_IT_WORKS_CAPABILITIES: [ContentRow, ContentRow, ContentRow, ContentRow] = [
  {
    title: "Flexible checks",
    description: "Method, interval, timeout, and retries - configurable per project.",
  },
  {
    title: "Smart classification",
    description: "Every ping sorted into up, degraded, waking, down, or unknown.",
  },
  {
    title: "Multi-channel alerts",
    description: "Discord, email, or a webhook - fired on status change only.",
  },
  {
    title: "Self-hosted & free",
    description: "Runs on your own Supabase project, comfortably within the free tier.",
  },
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    title: "Register a project",
    description:
      "Add your project's health-check URL and pick the hosting provider it runs on.",
  },
  {
    title: "Configure checks",
    description:
      "Set the method, interval, timeout, and retry threshold - or just use sensible defaults.",
  },
  {
    title: "Upkeep keeps watch",
    description:
      "Every check is classified as up, degraded, waking, down, or unknown, and consecutive failures are grouped into one incident.",
  },
  {
    title: "Get notified",
    description:
      "Discord, email, or a webhook - fired only when a project's status actually changes.",
  },
];
