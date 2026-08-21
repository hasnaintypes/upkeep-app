import { ArrowRight, Plus } from "lucide-react";
import type { WorkflowCard } from "../types";

export const WORKFLOWS_CONTENT = {
  label: "Workflows and integrations",
  headingLine1: "Collaborate across",
  headingLine2: "tools and teams",
  description:
    "Expand the capabilities of the Sprint system with a wide variety of integrations that keep everyone in your organization aligned and focused.",
};

export const WORKFLOW_CARDS: WorkflowCard[] = [
  {
    id: 1,
    category: "Customer Requests",
    title: "Build what customers actually want",
    icon: ArrowRight,
    mockup: "intercom",
  },
  {
    id: 2,
    category: "Powerful git workflows",
    title: "Automate pull requests and commit workflows",
    icon: Plus,
    mockup: "github",
  },
  {
    id: 3,
    category: "Sprint Mobile",
    title: "Move product work forward from anywhere",
    icon: ArrowRight,
    mockup: "mobile",
  },
  {
    id: 4,
    category: "Sprint Asks",
    title: "Turn workplace requests into actionable issues",
    icon: ArrowRight,
    mockup: "asks",
  },
  {
    id: 5,
    category: "Sprint Integrations",
    title: "100+ ways to enhance your Sprint experience",
    icon: ArrowRight,
    mockup: "integrations",
  },
  {
    id: 6,
    category: "Figma Integration",
    title: "Bridge the gap between engineering and design",
    icon: ArrowRight,
    mockup: "figma",
  },
  {
    id: 7,
    category: "Built for developers",
    title: "Build your own add-ons with the Sprint API",
    icon: ArrowRight,
    mockup: "api",
  },
];

export const WORKFLOW_MOCKUP_CONTENT = {
  intercom: {
    app: "Intercom",
    user: "zoe@acme.inc",
    message: "We need a cost breakdown",
    messageTrailing: "across...",
    requesterInitial: "A",
    requesterName: "ACME",
    requestLabel: "New request",
    dashboardName: "Multi-cloud cost",
    dashboardLabel: "dashboard",
    planningLabel: "Planning",
    planningQuarter: "Q4 2025",
  },
  github: {
    prNumber: "#20319",
    branch: "igor/lin 15287",
    prTitle: "add sourc...",
    actor: "igor",
    linkedLabel: "linked",
    linkedBranch: "igor/lin 15287",
    linkedTitle: "add sou...",
    statusChanges: [
      { actor: "igor", message: "changed status from In Progre..." },
      { actor: "GitHub", message: "changed status from In Revie..." },
      { actor: "igor", message: "changed status from Ready..." },
    ],
  },
  mobile: {
    label: "Inbox",
  },
  api: {
    label: "SPRINT API",
  },
};
