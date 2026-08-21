import {
  CircleUser,
  FileText,
  FolderKanban,
  HelpCircle,
  Inbox,
  Layers,
  LayoutGrid,
  Map,
  Settings,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import type { DashboardActivityItem, DashboardInboxItem, DashboardNavItem } from "../types";

export const DASHBOARD_BRAND = "Sprint";

export const DASHBOARD_MAIN_NAV: DashboardNavItem[] = [
  { icon: Inbox, label: "Inbox", badge: 3, active: true },
  { icon: CircleUser, label: "My Issues" },
];

export const DASHBOARD_WORKSPACE_NAV: DashboardNavItem[] = [
  { icon: Layers, label: "Initiatives", hasSubmenu: true },
  { icon: FolderKanban, label: "Projects", hasSubmenu: true },
  { icon: LayoutGrid, label: "Views", hasSubmenu: true },
  { icon: Users, label: "Teams", hasSubmenu: true },
];

export const DASHBOARD_FAVORITES_NAV: DashboardNavItem[] = [
  { icon: Smartphone, label: "Mobile App", color: "text-blue-400" },
  { icon: Map, label: "Q1 Roadmap", color: "text-orange-400" },
  { icon: FileText, label: "API Docs", color: "text-emerald-400" },
];

export const DASHBOARD_TEAMS_NAV: DashboardNavItem[] = [
  { icon: Sparkles, label: "Product", hasSubmenu: true },
  { icon: Settings, label: "Engineering", hasSubmenu: true },
];

export const DASHBOARD_BOTTOM_NAV: DashboardNavItem[] = [
  { icon: HelpCircle, label: "Help & Support" },
];

export const DASHBOARD_INBOX_ITEMS: DashboardInboxItem[] = [
  {
    id: "ENG-135",
    title: "Refactor sonic crawler",
    subtitle: "nan assigned you",
    time: "2h",
    avatar: "https://i.pravatar.cc/32?img=1",
    status: "in-progress",
    active: true,
  },
  {
    id: "LLM",
    title: "LLM Chatbot",
    subtitle: "New project update by raissa",
    time: "1d",
    avatar: "https://i.pravatar.cc/32?img=2",
    status: "todo",
    isProject: true,
  },
  {
    id: "ENG-159",
    title: "Error uploading images via API",
    subtitle: "SLA breached",
    time: "2d",
    avatar: "https://i.pravatar.cc/32?img=3",
    status: "bug",
  },
  {
    id: "DES-498",
    title: "Redesign users settings...",
    subtitle: "karri mentioned you",
    time: "4h",
    avatar: "https://i.pravatar.cc/32?img=4",
    status: "todo",
  },
  {
    id: "ENG-160",
    title: "Holtzmann engine is broken",
    subtitle: "You asked to be reminded",
    time: "1w",
    avatar: "https://i.pravatar.cc/32?img=5",
    status: "bug",
  },
  {
    title: "Sign up flow experiments",
    subtitle: "Added as project member",
    avatar: "https://i.pravatar.cc/32?img=6",
    status: "done",
    isProject: true,
  },
  {
    id: "MKT-122",
    title: "Design assets for marketing",
    subtitle: "erin marked as Duplicate",
    time: "1w",
    avatar: "https://i.pravatar.cc/32?img=7",
    status: "done",
  },
  {
    title: "Homepage v3",
    subtitle: "New project update by paco",
    avatar: "https://i.pravatar.cc/32?img=8",
    status: "todo",
    isProject: true,
  },
];

export const DASHBOARD_DETAIL = {
  breadcrumb: ["Engineering", "Spice harvester", "ENG-135"],
  title: "Refactor sonic crawler",
  codeComment: {
    prefix: "Comment.",
    field: "documentContent",
    body: "is defined wrongly. It should be a",
    type: "LazyManyToOne",
    suffix: "relation.",
  },
  prLabel: "#20319",
  prDescription: "igor/eng-135 add source to insights slice and segment",
};

export const DASHBOARD_ACTIVITY_ITEMS: DashboardActivityItem[] = [
  {
    avatar: "https://i.pravatar.cc/24?img=1",
    name: "nan",
    action: "moved from",
    from: "Backlog",
    to: "In Progress",
    time: "5 months ago",
  },
  {
    avatar: "https://i.pravatar.cc/24?img=2",
    name: "alex",
    action: "commented on",
    from: "this issue",
    time: "5 months ago",
  },
];
