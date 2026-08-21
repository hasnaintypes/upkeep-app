import type { FooterLinkGroup, NavLink } from "../types";

export const BRAND_NAME = "Upkeep";

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: "#" },
  { label: "How it works", href: "#" },
  { label: "Self-hosting", href: "#" },
  { label: "GitHub", href: "#" },
];

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    category: "Product",
    links: ["Dashboard", "Health checks", "Incidents", "Public status pages", "Keep-alive"],
  },
  {
    category: "Integrations",
    links: ["Discord", "Telegram", "Email", "Webhooks", "REST API"],
  },
  {
    category: "Resources",
    links: ["Documentation", "Health endpoint spec", "Self-hosting guide", "Changelog"],
  },
  {
    category: "Company",
    links: ["About", "Open source", "GitHub"],
  },
  {
    category: "Connect",
    links: ["GitHub", "X (Twitter)", "Report an issue"],
  },
];
