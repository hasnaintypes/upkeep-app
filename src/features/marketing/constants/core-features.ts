import type { CoreFeature } from "../types";

export const CORE_FEATURES_CONTENT = {
  headingLead: "Core",
  headingRest: "Features",
  primaryCta: "Get started free",
  secondaryCta: "Read the docs",
};

/** The fuller real feature set (checks, alerting, notification channels,
 * host compatibility, hosting cost) already established elsewhere on this
 * page/in the FAQ -- not new claims invented for this section. */
export const CORE_FEATURES: CoreFeature[] = [
  {
    icon: "checks",
    title: "Flexible checks",
    description:
      "Set the method, expected status, interval, and timeout per project - plus custom headers and a body for endpoints that need them.",
  },
  {
    icon: "status",
    title: "Smart classification",
    description:
      "Every ping is sorted into up, degraded, waking, down, or unknown, so a cold start is never mistaken for an outage.",
  },
  {
    icon: "keep-alive",
    title: "Keep-alive pinging",
    description:
      "Ping a project just often enough to stop it from spinning down, tuned to that host's own idle-timeout window.",
  },
  {
    icon: "incidents",
    title: "Incident grouping",
    description:
      "Consecutive down or degraded checks become one incident record, not disconnected rows.",
  },
  {
    icon: "alerts",
    title: "Status-change alerts",
    description:
      "Get notified when a project's status actually changes, not on every single check.",
  },
  {
    icon: "notifications",
    title: "Multi-channel notifications",
    description:
      "Discord webhook, email, or a generic outgoing webhook for your own integrations.",
  },
  {
    icon: "hosts",
    title: "Host-agnostic",
    description:
      "Works with Render, Railway, Vercel, Fly.io, Netlify, or any host exposing an HTTP(S) health endpoint.",
  },
  {
    icon: "self-hosted",
    title: "Self-hosted & free",
    description:
      "Runs on your own Supabase project, comfortably within the free tier - no per-monitor pricing.",
  },
];
