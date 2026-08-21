import type { LucideIcon } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterLinkGroup {
  category: string;
  links: string[];
}

export interface FeatureCardData {
  title: string;
  illustration: "grid" | "speed-lines" | "precision-workflow";
}

export interface AgentItem {
  name: string;
  isAgent: boolean;
  selected: boolean;
  icon: string;
}

export type WorkflowMockupType =
  | "intercom"
  | "github"
  | "mobile"
  | "asks"
  | "integrations"
  | "figma"
  | "api";

export interface WorkflowCard {
  id: number;
  category: string;
  title: string;
  icon: LucideIcon;
  mockup: WorkflowMockupType;
}

export interface DashboardNavItem {
  icon: LucideIcon;
  label: string;
  badge?: number;
  active?: boolean;
  hasSubmenu?: boolean;
  color?: string;
}

export interface DashboardInboxItem {
  id?: string;
  title: string;
  subtitle?: string;
  time?: string;
  avatar: string;
  status: "in-progress" | "todo" | "bug" | "done";
  isProject?: boolean;
  active?: boolean;
}

export interface DashboardActivityItem {
  avatar: string;
  name: string;
  action: string;
  from: string;
  to?: string;
  time: string;
}

export interface TimelineDateLabel {
  label: string;
  left: string;
  top: string;
  emphasis?: boolean;
}

export interface TimelineBar {
  label: string;
  left: string;
  top: string;
  width: string;
  height: string;
  containerClass: string;
  textClass: string;
  leadingDiamondClass?: string;
  trailingDiamondCount?: number;
  trailingCheckpoint?: boolean;
}

export interface ProjectMilestone {
  label: string;
  meta: string;
  state: "complete" | "in-progress";
}

export interface ProjectUpdateCard {
  label: string;
  message?: string;
  date?: string;
  variant: "off-track" | "at-risk" | "on-track";
  position: { top: string; left: string; width: string };
}

export type FeatureGridIconKey = "target" | "network" | "diamond" | "bars";

export interface FeatureGridItem {
  title: string;
  description: string;
  icon: FeatureGridIconKey;
}
