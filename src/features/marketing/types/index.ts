export interface NavLink {
  label: string;
  href: string;
}

export type FeatureIcon = "checks" | "status" | "dashboard" | "speed";

export interface FeatureCard {
  title: string;
  description: string;
  icon: FeatureIcon;
}

/** One title/description block in the content section's two-row layout. */
export interface ContentRow {
  title: string;
  description: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export type CoreFeatureIcon =
  | "checks"
  | "status"
  | "keep-alive"
  | "incidents"
  | "alerts"
  | "notifications"
  | "hosts"
  | "self-hosted";

/** One icon + title + description item in the "Core Features" sidebar
 * grid (distinct from the shorter, four-card `FeatureCard` list above it
 * on the page -- this one runs through the fuller real feature set). */
export interface CoreFeature {
  icon: CoreFeatureIcon;
  title: string;
  description: string;
}

/** One numbered step in the "How it works" section. */
export interface HowItWorksStep {
  title: string;
  description: string;
}

/** Generic lucide icons standing in for each host's real logo (no
 * trademarked brand SVGs bundled into this repo) -- picked for a loose
 * conceptual/visual nod to the real mark where one exists (Vercel's mark
 * literally is a triangle, Supabase's a bolt), not a literal reproduction. */
export type SupportedHostIcon =
  | "server"
  | "train-front"
  | "plane"
  | "triangle"
  | "globe"
  | "waves"
  | "boxes"
  | "cloud"
  | "zap";

/** One hosting platform shown in the "supported hosts" logo cloud --
 * icon + name, each linking to the real provider. */
export interface SupportedHost {
  name: string;
  href: string;
  icon: SupportedHostIcon;
}
