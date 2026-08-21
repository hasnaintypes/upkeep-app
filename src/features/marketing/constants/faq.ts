import type { FaqItem } from "../types";

export const FAQ_CONTENT = {
  heading: "FAQs",
  subheading: "Your questions answered",
  contactPrefix: "Can't find what you're looking for? Contact our",
  contactLinkText: "GitHub Discussions",
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "item-1",
    question: "What counts as \"down\"?",
    answer:
      "Every check is classified as up, down, degraded (slow but responding), waking (a cold start - successful response above your response-time threshold), or unknown (the check itself errored, e.g. DNS failure). A project only gets marked down after a configurable number of retries fail, so a single slow response or transient blip won't trigger a false alarm.",
  },
  {
    id: "item-2",
    question: "How does keep-alive prevent cold starts?",
    answer:
      "Keep-alive mode pings a project frequently enough - tuned to that host's specific idle-timeout window - purely to stop it from spinning down, independent of whether monitoring or alerting is enabled for that project. You can also scope it to an active window instead of pinging around the clock.",
  },
  {
    id: "item-3",
    question: "Which hosting providers are supported?",
    answer:
      "Upkeep is host-agnostic. Render, Railway, Vercel, Fly.io, Netlify, or anything else - if a project exposes a health endpoint over HTTP(S), it can be registered, regardless of tech stack or where it's deployed.",
  },
  {
    id: "item-4",
    question: "How will I get notified when something breaks?",
    answer:
      "Discord webhook, Telegram bot, email, or a generic outgoing webhook for your own integrations. Notifications fire on status change only, not on every check, so you get one alert per incident instead of a flood.",
  },
  {
    id: "item-5",
    question: "Is Upkeep something I have to pay for?",
    answer:
      "No. Upkeep is self-hosted on your own Supabase project and designed to run comfortably within Supabase's free tier for personal use - no per-monitor pricing or check-frequency limits imposed by a third party.",
  },
];
