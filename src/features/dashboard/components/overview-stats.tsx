import { CheckCircle2, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Project } from "@/features/projects";
import type { ProjectUptimeSummary } from "../types";

/** A project only counts toward "added this week" if it was created within
 * this many days -- matches the uptime windows' own "7d" granularity rather
 * than introducing a new arbitrary cutoff. */
const NEW_PROJECT_WINDOW_DAYS = 7;

/** Uptime-average deltas smaller than this are "steady", not a real trend
 * -- two decimal places of uptime-% noise shouldn't render as a trend
 * arrow. */
const UPTIME_TREND_EPSILON = 0.05;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * At-a-glance portfolio metrics for the dashboard overview page, above the
 * per-project table -- a scan layer, not a repeat of the per-project detail
 * page's charts. Same card anatomy as shadcn's own stat-card block
 * (`CardDescription` label, big `CardTitle` value, `CardAction` trend
 * badge, two-line `CardFooter`), but every figure here is real, not mock
 * data: no fabricated percentage deltas for the two cards ("Down now",
 * "Open incidents") that don't have an actual prior-period baseline to
 * compare against -- those get a severity-styled badge instead of an
 * invented trend arrow.
 */
export function OverviewStats({
  projects,
  summaries,
  openIncidents,
}: {
  projects: Project[];
  summaries: ProjectUptimeSummary[];
  openIncidents: number | null;
}) {
  const newProjectCutoff = Date.now() - NEW_PROJECT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const newProjectCount = projects.filter(
    (p) => new Date(p.created_at).getTime() >= newProjectCutoff,
  ).length;

  const uptime7d = average(summaries.map((s) => s.uptime_7d).filter((v): v is number => v !== null));
  const uptime30d = average(
    summaries.map((s) => s.uptime_30d).filter((v): v is number => v !== null),
  );
  const uptimeDelta = uptime7d !== null && uptime30d !== null ? uptime7d - uptime30d : null;

  const downNow = summaries.filter((s) => s.last_status === "down").length;

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 lg:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active projects</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {projects.length.toLocaleString()}
          </CardTitle>
          {newProjectCount > 0 && (
            <CardAction>
              <Badge variant="outline">
                <TrendingUp />
                {`+${newProjectCount}`}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {newProjectCount > 0 ? (
              <>
                {newProjectCount} added this week <TrendingUp className="size-4" />
              </>
            ) : (
              "No new projects"
            )}
          </div>
          <div className="text-muted-foreground">Monitored across your portfolio</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Portfolio uptime (7d)</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {uptime7d === null ? "—" : `${uptime7d.toFixed(2)}%`}
          </CardTitle>
          {uptimeDelta !== null && Math.abs(uptimeDelta) >= UPTIME_TREND_EPSILON && (
            <CardAction>
              <Badge variant="outline">
                {uptimeDelta > 0 ? <TrendingUp /> : <TrendingDown />}
                {`${uptimeDelta > 0 ? "+" : ""}${uptimeDelta.toFixed(1)} pts`}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {uptimeDelta === null || Math.abs(uptimeDelta) < UPTIME_TREND_EPSILON ? (
              "Steady"
            ) : uptimeDelta > 0 ? (
              <>
                Trending up <TrendingUp className="size-4" />
              </>
            ) : (
              <>
                Trending down <TrendingDown className="size-4" />
              </>
            )}
          </div>
          <div className="text-muted-foreground">vs 30-day average</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Down now</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {downNow.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant={downNow > 0 ? "destructive" : "outline"}>
              {downNow > 0 ? <TriangleAlert /> : <CheckCircle2 />}
              {downNow > 0 ? "Needs attention" : "All healthy"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {downNow > 0
              ? `${downNow} project${downNow === 1 ? "" : "s"} unreachable`
              : "All systems normal"}
          </div>
          <div className="text-muted-foreground">Live status across your portfolio</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Open incidents</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {openIncidents === null ? "—" : openIncidents.toLocaleString()}
          </CardTitle>
          {openIncidents !== null && (
            <CardAction>
              <Badge variant={openIncidents > 0 ? "destructive" : "outline"}>
                {openIncidents > 0 ? <TriangleAlert /> : <CheckCircle2 />}
                {openIncidents > 0 ? "Unresolved" : "None open"}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {openIncidents === null
              ? "Data unavailable"
              : openIncidents > 0
                ? `${openIncidents} awaiting resolution`
                : "No open incidents"}
          </div>
          <div className="text-muted-foreground">Across every project you own</div>
        </CardFooter>
      </Card>
    </div>
  );
}
