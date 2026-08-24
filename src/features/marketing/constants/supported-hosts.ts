import type { SupportedHost } from "../types";

export const SUPPORTED_HOSTS_CONTENT = {
  heading: "Works with the",
  headingHighlight: "hosts you use",
};

/** The free-tier hosting providers named in the PRD's own scope (§1/§5.1/
 * §9) -- not a fabricated customer/"used by" list. Upkeep is a self-hosted
 * personal tool, so this section shows provider *compatibility*, not
 * social proof from real users. */
export const SUPPORTED_HOSTS: SupportedHost[] = [
  { name: "Render", href: "https://render.com", icon: "server" },
  { name: "Railway", href: "https://railway.app", icon: "train-front" },
  { name: "Vercel", href: "https://vercel.com", icon: "triangle" },
  { name: "Netlify", href: "https://netlify.com", icon: "globe" },
  { name: "Convex", href: "https://convex.dev", icon: "boxes" },
  { name: "Supabase", href: "https://supabase.com", icon: "zap" },
];
