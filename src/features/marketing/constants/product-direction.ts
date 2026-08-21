import type {
  FeatureGridItem,
  ProjectMilestone,
  ProjectUpdateCard,
  TimelineBar,
  TimelineDateLabel,
} from "../types";

export const PRODUCT_DIRECTION_CONTENT = {
  label: "Project and long-term planning",
  heading: "Set the product direction",
  descriptionLead: "Align your team around a unified product timeline.",
  description: "Plan, manage, and track all product initiatives with Sprint's visual planning tools.",
};

export const TIMELINE_DATE_LABELS: TimelineDateLabel[] = [
  { label: "30", left: "8%", top: "80px" },
  { label: "AUG 3", left: "18%", top: "55px" },
  { label: "10", left: "32%", top: "35px" },
  { label: "17", left: "48%", top: "15px" },
  { label: "AUG 22", left: "58%", top: "-10px", emphasis: true },
  { label: "24", left: "70%", top: "-5px" },
  { label: "SEP", left: "88%", top: "-25px" },
];

export const TIMELINE_BARS: TimelineBar[] = [
  {
    label: "Realtime inference",
    left: "5%",
    top: "100px",
    width: "45%",
    height: "48px",
    containerClass: "bg-zinc-800/90 border-zinc-700/50",
    textClass: "text-zinc-300 font-medium",
    leadingDiamondClass: "w-4 h-4 bg-zinc-500/60",
    trailingCheckpoint: true,
  },
  {
    label: "Prototype",
    left: "15%",
    top: "155px",
    width: "25%",
    height: "44px",
    containerClass: "bg-zinc-800/70 border-zinc-700/40",
    textClass: "text-zinc-500",
    leadingDiamondClass: "w-3 h-3 bg-zinc-600/60",
  },
  {
    label: "Beta",
    left: "45%",
    top: "155px",
    width: "45%",
    height: "48px",
    containerClass: "bg-zinc-800/90 border-zinc-700/50",
    textClass: "text-zinc-400",
    trailingDiamondCount: 3,
  },
  {
    label: "RLHF fine tuning",
    left: "35%",
    top: "240px",
    width: "28%",
    height: "48px",
    containerClass: "bg-zinc-800/70 border-zinc-700/40",
    textClass: "text-zinc-400",
    trailingDiamondCount: 2,
  },
];

export const PROJECT_OVERVIEW_CONTENT = {
  heading: "Manage projects end-to-end",
  description: "Consolidate specs, milestones, tasks, and other documentation in one centralized location.",
  cardTitle: "Project Overview",
  propertiesLabel: "Properties",
  status: "In Progress",
  team: "ENG",
  resourcesLabel: "Resources",
  resources: ["Exploration", "User interviews"],
  milestonesLabel: "Milestones",
};

export const PROJECT_MILESTONES: ProjectMilestone[] = [
  { label: "Design Review", meta: "100%", state: "complete" },
  { label: "Internal Alpha", meta: "100% of 10", state: "complete" },
  { label: "GA", meta: "25% of 53", state: "in-progress" },
];

export const PROJECT_UPDATES_CONTENT = {
  heading: "Project updates",
  description: "Communicate progress and project health with built-in project updates.",
};

export const PROJECT_UPDATE_CARDS: ProjectUpdateCard[] = [
  {
    label: "Off track",
    variant: "off-track",
    position: { top: "0", left: "10%", width: "80%" },
  },
  {
    label: "At risk",
    variant: "at-risk",
    position: { top: "30px", left: "5%", width: "85%" },
  },
  {
    label: "On track",
    message: "We are ready to launch next Thursday",
    date: "Sep 8",
    variant: "on-track",
    position: { top: "60px", left: "0", width: "95%" },
  },
];

export const IDEATE_CONTENT = {
  headingLine1: "Ideate and specify",
  headingLine2: "what to build next",
  features: ["Collaborative documents", "Inline comments", "Text-to-issue commands"],
};

export const DOC_MOCKUP_CONTENT = {
  breadcrumb: ["Spice harvester", "Project specs"],
  titlePrefix: "Collaborate on",
  titleHighlight: "ideas",
  titleTag: "zoe",
  descriptionPrefix: "Write down product ideas and work together on",
  descriptionHighlight: "fea",
  descriptionTag: "quinn",
  descriptionSuffix:
    'ture specs in realtime, multiplayer project documents. Add **style** and ##structure with rich-text formatting options.',
};

export const FEATURE_GRID: FeatureGridItem[] = [
  { title: "Initiatives", description: "Coordinate strategic product efforts.", icon: "target" },
  { title: "Cross-team projects", description: "Collaborate across teams and departments.", icon: "network" },
  { title: "Milestones", description: "Break projects down into concrete phases.", icon: "diamond" },
  { title: "Progress insights", description: "Track scope, velocity, and progress over time.", icon: "bars" },
];
