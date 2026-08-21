import type { FooterLinkGroup, NavLink } from "../types";

export const BRAND_NAME = "Sprint";

export const NAV_LINKS: NavLink[] = [
  { label: "Product", href: "#" },
  { label: "Resources", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Customers", href: "#" },
  { label: "Contact", href: "#" },
];

export const FOOTER_LINK_GROUPS: FooterLinkGroup[] = [
  {
    category: "Features",
    links: ["Plan", "Build", "Insights", "Customer Requests", "Sprint Asks", "Security", "Mobile"],
  },
  {
    category: "Product",
    links: ["Pricing", "Method", "Integrations", "Changelog", "Documentation", "Download", "Switch"],
  },
  {
    category: "Company",
    links: ["About", "Customers", "Careers", "Now", "README", "Quality", "Brand"],
  },
  {
    category: "Resources",
    links: ["Developers", "Status", "Startups", "Report vulnerability", "DPA", "Privacy", "Terms"],
  },
  {
    category: "Connect",
    links: ["Contact us", "Community", "X (Twitter)", "GitHub", "YouTube"],
  },
];
