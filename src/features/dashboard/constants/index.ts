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
