import type { AgentItem } from "../types";

export const AI_SECTION_CONTENT = {
  label: "Artificial intelligence",
  heading: "AI-assisted product development",
  descriptionLead: "Sprint for Agents.",
  description:
    "Choose from a variety of AI agents and start delegating work, from code generation to other technical tasks.",
  learnMoreCta: "Learn more",
  assignPlaceholder: "Assign to...",
};

export const AI_AGENTS: AgentItem[] = [
  { name: "Cursor", isAgent: true, selected: true, icon: "◇" },
  { name: "GitHub Copilot", isAgent: true, selected: false, icon: "◉" },
  { name: "Sentry", isAgent: true, selected: false, icon: "◈" },
  { name: "Leela", isAgent: false, selected: false, icon: "○" },
  { name: "Codex", isAgent: true, selected: false, icon: "◎" },
  { name: "Conor", isAgent: false, selected: false, icon: "○" },
];

export const AI_TRIAGE_CONTENT = {
  heading: "Self-driving product operations",
  description:
    "Streamline your product development workflows with AI assistance for routine, manual tasks.",
  cardLabelPrefix: "Triage",
  cardLabelSuffix: "Intelligence",
  suggestionsLabel: "Suggestions",
  suggestionName: "nan",
  suggestionProject: "Mobile App Refactor",
  suggestionChannel: "Slack",
  duplicateLabel: "Duplicate of",
  relatedLabel: "Related to",
  suggestedAssignee: "nan",
  whyLabel: "Why this assignee was suggested",
  whyDescription:
    "This person was the assignee on previous issues related to performance problems in the mobile app launch flow",
  alternativesLabel: "Alternatives",
  alternatives: ["yann", "erin"],
  acceptCta: "Accept suggestion",
};

export const AI_MCP_CONTENT = {
  heading: "Sprint MCP",
  description: "Connect Sprint to your favorite tools including Cursor, Claude, ChatGPT, and more.",
  endpointComment: "//mcp.sprint.app/sse",
  snippet: {
    key1: "mcpServers",
    key2: "sprint",
    key3: "command",
    value: "npx",
  },
  askPlaceholder: "Ask anything",
  actions: ["Attach", "Search", "Reason"],
};
