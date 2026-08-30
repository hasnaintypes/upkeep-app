import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon, ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDateTime, formatRelativeTime, isExternalUrl } from "@/lib/utils";
import { checkTargetPrefix, type Project } from "@/features/projects";
import {
  DEGRADED_DAY_THRESHOLD,
  DOWN_DAY_THRESHOLD,
  HEATMAP_CELL_COLOR,
  STATUS_META,
} from "../constants";
import type { ProjectUptimeSummary } from "../types";
import { StatusBadge } from "./status-badge";

const RING_SIZE = 56;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Same healthy/degraded/down bucketing as the uptime heatmap
 * (`cellBucket` in uptime-heatmap.tsx), applied to the rolling 24h uptime %
 * instead of a single day -- kept as its own small helper rather than
 * importing the heatmap's version since that one takes a `DailyHistoryPoint`
 * and this takes a bare percentage. */
function uptimeBucket(percentage: number | null): keyof typeof HEATMAP_CELL_COLOR {
  if (percentage === null) return "none";
  if (percentage >= DEGRADED_DAY_THRESHOLD) return "healthy";
  if (percentage >= DOWN_DAY_THRESHOLD) return "degraded";
  return "down";
}

/** Stroke color per bucket -- same literal palette as `HEATMAP_CELL_COLOR`,
 * as a `stroke-*` class instead of `bg-*` since this paints an SVG ring, not
 * a filled bar. */
const RING_STROKE_COLOR: Record<keyof typeof HEATMAP_CELL_COLOR, string> = {
  healthy: "stroke-emerald-500",
  degraded: "stroke-amber-500",
  down: "stroke-red-500",
  none: "stroke-border",
};

/**
 * A radial ring around the status icon showing rolling 24h uptime -- this
 * page's one deliberate visual signature, tying the header back to the same
 * severity-color language as `UptimeHeatmap`'s bars (emerald/amber/red)
 * rather than introducing a new accent. Every other status indicator on this
 * page (badges) is deliberately neutral/colorless per `STATUS_META`'s own
 * accessibility reasoning -- this ring is additive, not a replacement for
 * that, so color-blind users still get the icon + label everywhere it
 * matters.
 */
function UptimeRing({
  percentage,
  status,
}: {
  percentage: number | null;
  status: ProjectUptimeSummary["last_status"];
}) {
  const bucket = uptimeBucket(percentage);
  const Icon = STATUS_META[status ?? "unknown"].icon;
  const dashoffset =
    percentage === null ? 0 : RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percentage)) / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      role="img"
      aria-label={percentage === null ? "No 24h uptime data yet" : `${percentage}% uptime over 24 hours`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          className="fill-none stroke-border"
        />
        {percentage !== null && (
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            className={cn("fill-none transition-[stroke-dashoffset] duration-500", RING_STROKE_COLOR[bucket])}
          />
        )}
      </svg>
      <Icon className="absolute inset-0 m-auto size-5 text-foreground" aria-hidden="true" />
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-mono text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds % 60 === 0 && seconds >= 60) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatKeepAliveWindow(project: Project): string | null {
  if (!project.keep_alive_enabled) return null;
  if (!project.keep_alive_window_start || !project.keep_alive_window_end) return "All day";
  const tz = project.keep_alive_timezone ? ` (${project.keep_alive_timezone})` : "";
  return `${project.keep_alive_window_start}–${project.keep_alive_window_end}${tz}`;
}

/**
 * Rich header/hero for the per-project detail page: identity + live status
 * (name, status ring/badge, active/paused state), the check target, an
 * at-a-glance quick-stat strip (rolling uptime windows + last checked, the
 * same `summary` fields the overview table shows per-row but weren't
 * surfaced here before), and a collapsed `<details>` disclosure for the
 * project's less-scannable configuration -- check timing, hosting provider,
 * collection, keep-alive window, tags. Kept as a plain Server Component
 * (the `<details>` disclosure needs no client JS, same pattern as
 * `CheckLogTable`'s response-snippet expando) inside a `variant="soft"`
 * `Card`, the same subdued container style this app already uses for empty
 * states -- not a bordered/elevated "hero card", which would be the one
 * generic flourish this strictly neutral dashboard theme deliberately
 * avoids.
 */
export function ProjectDetailHeader({
  project,
  summary,
}: {
  project: Project;
  summary: ProjectUptimeSummary | null;
}) {
  const keepAliveWindow = formatKeepAliveWindow(project);
  const isRateLimited =
    project.rate_limit_backoff_until && new Date(project.rate_limit_backoff_until) > new Date();

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/dashboard/projects"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Projects
      </Link>

      <Card variant="soft">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <UptimeRing percentage={summary?.uptime_24h ?? null} status={summary?.last_status ?? null} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold">{project.name}</h1>
                  <StatusBadge status={summary?.last_status ?? null} />
                  <Badge variant={project.is_active ? "default" : "secondary"}>
                    {project.is_active ? "Active" : "Paused"}
                  </Badge>
                </div>
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
                <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="shrink-0 text-xs font-medium tracking-wide uppercase">
                    {checkTargetPrefix(project.check_type, project.method)}
                  </span>
                  {isExternalUrl(project.health_url) ? (
                    <a
                      href={project.health_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={project.health_url}
                      className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{project.health_url}</span>
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate" title={project.health_url}>
                      {project.health_url}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-6">
              <QuickStat
                label="24h uptime"
                value={summary?.uptime_24h === null || summary?.uptime_24h === undefined ? "—" : `${summary.uptime_24h}%`}
              />
              <QuickStat
                label="7d uptime"
                value={summary?.uptime_7d === null || summary?.uptime_7d === undefined ? "—" : `${summary.uptime_7d}%`}
              />
              <QuickStat
                label="30d uptime"
                value={summary?.uptime_30d === null || summary?.uptime_30d === undefined ? "—" : `${summary.uptime_30d}%`}
              />
              <QuickStat
                label="90d uptime"
                value={summary?.uptime_90d === null || summary?.uptime_90d === undefined ? "—" : `${summary.uptime_90d}%`}
              />
              <QuickStat label="Interval" value={formatSeconds(project.check_interval_seconds)} />
              <QuickStat
                label="Last checked"
                value={summary?.last_checked_at ? formatRelativeTime(summary.last_checked_at) : "Never"}
              />
            </div>
          </div>

          {isRateLimited && (
            <Badge
              variant="outline"
              className="w-fit border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              Checks paused until{" "}
              {new Date(project.rate_limit_backoff_until!).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              — this host has been rate-limiting Upkeep&apos;s requests.
            </Badge>
          )}

          <details className="group border-t pt-3">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Details
              <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <DetailRow label="Timeout" value={`${project.timeout_ms}ms`} />
              {project.check_type === "http" && (
                <DetailRow label="Expected status" value={project.expected_status} />
              )}
              <DetailRow label="Hosting provider" value={project.hosting_provider ?? "—"} />
              <DetailRow label="Collection" value={project.collection ?? "—"} />
              <DetailRow
                label="Keep-alive pings"
                value={keepAliveWindow ?? "Off"}
              />
              <DetailRow label="Created" value={formatDateTime(project.created_at)} />
              {project.tags && project.tags.length > 0 && (
                <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
                  <p className="text-xs text-muted-foreground">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
