import { CheckCircle2, CircleHelp, Sunrise, TriangleAlert, XCircle } from "lucide-react";
import type { CheckStatus } from "@/features/projects";
import type { UptimeWindowKey } from "../types";

/**
 * Display metadata for each of the five check statuses (PRD §5.2), used by
 * `StatusBadge` on the dashboard overview (#29). Accessibility requirement
 * from the issue ("not color-alone -- include a text/icon label too") is
 * why every status carries a distinct icon and its own word, not just a
 * badge color -- color alone doesn't distinguish degraded/waking today
 * (see `badgeVariant`'s comment below), but the icon + label always do.
 *
 * `badgeVariant` intentionally reuses the same up/degraded/waking/down/
 * unknown -> default/secondary/secondary/destructive/outline mapping as
 * `MANUAL_CHECK_BADGE_VARIANT` in features/projects/components/project-list.tsx
 * (issue #28), for visual consistency between the two places a check status
 * renders as a badge. That mapping predates this one and isn't updated here
 * -- consolidating them into one shared export is a reasonable follow-up,
 * flagged rather than done silently as part of this issue.
 */
export const STATUS_META: Record<
  CheckStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  up: { label: "Up", icon: CheckCircle2, badgeVariant: "default" },
  degraded: { label: "Degraded", icon: TriangleAlert, badgeVariant: "secondary" },
  waking: { label: "Waking", icon: Sunrise, badgeVariant: "secondary" },
  down: { label: "Down", icon: XCircle, badgeVariant: "destructive" },
  unknown: { label: "Unknown", icon: CircleHelp, badgeVariant: "outline" },
};

/** Ordered left-to-right column definitions for the overview table's
 * rolling-uptime columns (PRD §5.6, #29). */
export const UPTIME_WINDOWS: { key: UptimeWindowKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

/**
 * Uptime-% thresholds for the heatmap/timeline's per-day cell color (PRD
 * §5.6, Phase 4, #31) -- status-page.io-style: a day only reads as fully
 * "healthy" at 100% (any failure at all still shows, if faintly), a
 * partial-outage day is amber, and a day below `DEGRADED_DAY_THRESHOLD`
 * uptime is red. Distinct from `classify.ts`'s per-*check*
 * degraded/waking thresholds (response-time based) -- this is a per-*day*
 * aggregate uptime-percentage bucketing, a different axis entirely.
 */
export const DEGRADED_DAY_THRESHOLD = 99.9;
export const DOWN_DAY_THRESHOLD = 95;

/** Tailwind color classes for each heatmap cell bucket. Direct palette
 * colors (not this project's neutral OKLCH theme tokens) -- a status
 * timeline is exactly the kind of display where literal green/amber/red is
 * the expected, most legible convention (every status-page product uses
 * it), unlike the theme's deliberately neutral chrome everywhere else. */
export const HEATMAP_CELL_COLOR = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  none: "bg-muted",
} as const;

/** Rows per page for the raw check log table (PRD §5.6, Phase 4, #32). */
export const CHECK_LOG_PAGE_SIZE = 25;

/** How many of a project's most recent incidents the detail page shows
 * (PRD §5.4, Phase 5, #37) -- a flat cap, not real pagination (#38 builds
 * the actual paginated/sortable incident history view). Generous enough
 * that it won't realistically need paginating for a single project at
 * this app's scale (PRD §9, ~50 projects total) before #38 replaces it. */
export const INCIDENT_LIST_LIMIT = 20;
