import type { LucideIcon } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
}

export type FeatureIllustration = "code" | "schedule";

export interface FeatureCard {
  title: string;
  description: string;
  illustration: FeatureIllustration;
}

export interface IntegrationCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

export type ContentHighlightIcon =
  | "list-checks"
  | "bell"
  | "layout-dashboard"
  | "line-chart";

export interface ContentHighlight {
  icon: ContentHighlightIcon;
  title: string;
  description: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface HowItWorksStep {
  title: string;
  description: string;
}
