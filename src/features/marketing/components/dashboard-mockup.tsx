"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, CirclePower, Link2, MoreHorizontal, Plus, Search } from "lucide-react";
import {
  DASHBOARD_ACTIVITY_ITEMS,
  DASHBOARD_BOTTOM_NAV,
  DASHBOARD_BRAND,
  DASHBOARD_DETAIL,
  DASHBOARD_FAVORITES_NAV,
  DASHBOARD_INBOX_ITEMS,
  DASHBOARD_MAIN_NAV,
  DASHBOARD_TEAMS_NAV,
  DASHBOARD_WORKSPACE_NAV,
} from "../constants/dashboard-mockup";
import type { DashboardActivityItem, DashboardInboxItem, DashboardNavItem } from "../types";

export function DashboardMockup() {
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.3,
        delayChildren: 0.5,
      },
    },
  };

  const panelVariants = {
    hidden: {
      opacity: 0,
      x: 100,
      y: -80,
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: 1.2,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <motion.div
      className="w-full h-full bg-zinc-950 flex overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Sidebar */}
      <motion.div
        className="w-[220px] h-full bg-zinc-900/80 border-r border-zinc-800/50 flex flex-col shrink-0"
        variants={panelVariants}
      >
        {/* Logo */}
        <div className="p-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <CirclePower className="w-5 h-5 text-white" />
            <span className="text-white font-semibold text-sm">{DASHBOARD_BRAND}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 ml-auto" />
          </div>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/50 rounded-md text-zinc-500 text-xs">
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
            <span className="ml-auto text-[10px] bg-zinc-700/50 px-1.5 py-0.5 rounded">⌘K</span>
          </div>
        </div>

        {/* Main nav */}
        <div className="px-3 space-y-0.5">
          {DASHBOARD_MAIN_NAV.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>

        {/* Workspace section */}
        <div className="mt-5 px-3">
          <div className="px-2 py-1 text-[10px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1">
            Workspace
          </div>
          <div className="space-y-0.5 mt-1">
            {DASHBOARD_WORKSPACE_NAV.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        </div>

        {/* Favorites section */}
        <div className="mt-5 px-3">
          <div className="px-2 py-1 text-[10px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1">
            Favorites
          </div>
          <div className="space-y-0.5 mt-1">
            {DASHBOARD_FAVORITES_NAV.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        </div>

        {/* Teams section */}
        <div className="mt-5 px-3 flex-1">
          <div className="px-2 py-1 text-[10px] text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-1">
            Your Teams
          </div>
          <div className="space-y-0.5 mt-1">
            {DASHBOARD_TEAMS_NAV.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="p-3 border-t border-zinc-800/50">
          {DASHBOARD_BOTTOM_NAV.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>
      </motion.div>

      {/* Inbox List */}
      <motion.div
        className="w-[320px] h-full bg-zinc-900/40 border-r border-zinc-800/50 flex flex-col shrink-0"
        variants={panelVariants}
      >
        <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Inbox</h3>
          <div className="flex items-center gap-2">
            <button className="text-zinc-500 hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto scrollbar-hide">
          {DASHBOARD_INBOX_ITEMS.map((item) => (
            <InboxItem key={item.id ?? item.title} {...item} />
          ))}
        </div>
      </motion.div>

      {/* Detail Panel */}
      <motion.div className="flex-1 h-full bg-zinc-950 flex flex-col overflow-hidden" variants={panelVariants}>
        {/* Header breadcrumb */}
        <div className="px-5 py-3 border-b border-zinc-800/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            {DASHBOARD_DETAIL.breadcrumb.map((crumb, index) => (
              <span key={crumb} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-zinc-600">›</span>}
                <span
                  className={
                    index === DASHBOARD_DETAIL.breadcrumb.length - 1
                      ? "text-zinc-300"
                      : index === 1
                        ? "text-emerald-400"
                        : "text-zinc-500"
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>
          <MoreHorizontal className="w-4 h-4 text-zinc-500" />
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-auto scrollbar-hide">
          <h2 className="text-white text-xl font-semibold mb-5">{DASHBOARD_DETAIL.title}</h2>

          {/* Code block */}
          <div className="bg-zinc-900/80 rounded-lg p-4 text-[11px] font-mono mb-5 border border-zinc-800/50">
            <div className="space-y-2">
              <div>
                <span className="text-zinc-500">{DASHBOARD_DETAIL.codeComment.prefix}</span>
                <span className="text-amber-300">{DASHBOARD_DETAIL.codeComment.field}</span>
                <span className="text-zinc-400"> {DASHBOARD_DETAIL.codeComment.body} </span>
                <span className="text-cyan-300">{DASHBOARD_DETAIL.codeComment.type}</span>
                <span className="text-zinc-400"> {DASHBOARD_DETAIL.codeComment.suffix}</span>
              </div>
              <div className="mt-3 text-zinc-600">
                {/* The document content that this comment is associated with. */}
              </div>
              <div>
                <span className="text-purple-400">@ManyToOne</span>
                <span className="text-zinc-400">(</span>
                <span className="text-cyan-300">DocumentContent</span>
                <span className="text-zinc-400">,</span>
                <span className="text-amber-300">comments</span>
                <span className="text-zinc-400">,</span>
                <span className="text-amber-300">cascade</span>
                <span className="text-zinc-400">:</span>
                <span className="text-orange-300">true</span>
                <span className="text-zinc-400">,</span>
                <span className="text-amber-300">nullable</span>
                <span className="text-zinc-400">:</span>
                <span className="text-orange-300">false</span>
                <span className="text-zinc-400">)</span>
              </div>
              <div>
                <span className="text-blue-400">public </span>
                <span className="text-amber-300">documentContent</span>
                <span className="text-zinc-400">?: </span>
                <span className="text-cyan-300">DocumentContent</span>
                <span className="text-zinc-400">;</span>
              </div>
              <div className="mt-3 text-zinc-400">
                We would be accessing
                <span className="text-emerald-400">CachedPromise&lt;DocumentContent&gt;</span>
                then, and document content would be hydrated.
              </div>
            </div>
          </div>

          {/* Meta actions */}
          <div className="space-y-2 text-sm mb-5">
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">
              <Plus className="w-4 h-4" />
              <span>Add sub-issues</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">
              <Link2 className="w-4 h-4" />
              <span>Links</span>
            </div>
          </div>

          {/* PR reference */}
          <div className="text-xs text-zinc-500 mb-5">
            <span className="text-zinc-600">{DASHBOARD_DETAIL.prLabel}</span>
            <span> {DASHBOARD_DETAIL.prDescription}</span>
          </div>

          {/* Activity */}
          <div className="pt-4 border-t border-zinc-800/50">
            <div className="text-xs text-zinc-500 font-medium mb-3 uppercase tracking-wider">Activity</div>
            <div className="space-y-3">
              {DASHBOARD_ACTIVITY_ITEMS.map((item) => (
                <ActivityItem key={`${item.name}-${item.time}`} {...item} />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NavItem({ icon: Icon, label, badge, active, hasSubmenu, color }: DashboardNavItem) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
      }`}
    >
      <Icon className={`w-4 h-4 ${color || ""}`} />
      <span className="flex-1 text-xs">{label}</span>
      {badge && (
        <span className="bg-indigo-500/80 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-medium px-1">
          {badge}
        </span>
      )}
      {hasSubmenu && <ChevronRight className="w-3 h-3 text-zinc-600" />}
    </div>
  );
}

function InboxItem({ id, title, subtitle, time, avatar, status, isProject, active }: DashboardInboxItem) {
  const statusColors: Record<string, string> = {
    "in-progress": "bg-yellow-500",
    todo: "bg-zinc-600",
    bug: "bg-red-500",
    done: "bg-emerald-500",
  };

  return (
    <div
      className={`px-4 py-3 border-b border-zinc-800/30 cursor-pointer transition-colors ${
        active ? "bg-zinc-800/50" : "hover:bg-zinc-800/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar || "/placeholder.svg"} alt="" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {id && <span className="text-zinc-500 text-[10px]">{id}</span>}
            {isProject && <span className="text-violet-400 text-[10px]">Project</span>}
            <div className={`w-2 h-2 rounded-full ${statusColors[status] || "bg-zinc-500"}`} />
          </div>
          <p className="text-white text-xs truncate leading-tight">{title}</p>
          {subtitle && <p className="text-zinc-500 text-[10px] mt-0.5 truncate">{subtitle}</p>}
        </div>
        {time && <span className="text-zinc-600 text-[10px] shrink-0">{time}</span>}
      </div>
    </div>
  );
}

function ActivityItem({ avatar, name, action, from, to, time }: DashboardActivityItem) {
  return (
    <div className="flex items-start gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar || "/placeholder.svg"} alt="" className="w-5 h-5 rounded-full" />
      <div className="flex-1">
        <p className="text-zinc-400 text-xs">
          <span className="text-white">{name}</span>
          <span className="text-zinc-500"> {action} </span>
          <span className="text-zinc-300">{from}</span>
          {to && (
            <>
              <span className="text-zinc-500"> to </span>
              <span className="text-zinc-300">{to}</span>
            </>
          )}
        </p>
        <p className="text-zinc-600 text-[10px] mt-0.5">{time}</p>
      </div>
    </div>
  );
}
