import { Fragment } from "react";
import { Download, FileTextIcon } from "lucide-react";
import { CursorPagination } from "@/components/data-table/cursor-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineEmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { hasActiveCheckLogFilters } from "../lib/check-log-filters";
import { StatusBadge } from "./status-badge";
import { CheckLogToolbar } from "./check-log-toolbar";
import type { CheckLogFilters, CheckLogPage } from "../types";

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Builds the detail page URL for a given page's cursor -- plain query
 * params (`cursor`/`dir`), read back by the page's own loader. Also carries
 * forward the current status/search filters, so paginating a filtered log
 * doesn't silently drop back to the unfiltered view. */
function pageHref(
  projectId: string,
  checkedAt: string,
  direction: "next" | "previous",
  filters: CheckLogFilters,
): string {
  const params = new URLSearchParams({ cursor: checkedAt, dir: direction });
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  return `/dashboard/projects/${projectId}?${params.toString()}`;
}

/**
 * Raw check log table for the per-project detail page (PRD §5.6, Phase 4,
 * #32): newest-first, keyset-paginated (see `getProjectChecksPage`).
 *
 * The header's CSV/JSON export links (PRD §5.3, Phase 10, #64) hit a
 * separate Route Handler (`/api/projects/[id]/checks/export`), not this
 * page's own paginated data -- an export is the *full* history, not just
 * whatever page happens to be showing, and a plain `<a href download>` is
 * enough to trigger a same-origin cookie-authenticated file download with
 * zero client JS, consistent with this table otherwise being a plain
 * Server Component.
 *
 * `response_snippet` is never rendered inline -- per the issue's
 * acceptance criteria, it's truncated failure-only data, not something
 * every row needs displayed. A row with one (only ever non-null on a
 * failed check -- see persist.ts) gets an extra row directly below it
 * containing a native `<details>/<summary>` disclosure -- zero client JS
 * for the expand/collapse interaction, consistent with this table
 * otherwise being a plain Server Component (pagination is plain `<Link>`s
 * changing the `cursor`/`dir` URL search params, not client state).
 *
 * Styled with the same bordered/`bg-muted/50`-header table shell as the
 * Projects/API-keys/Incidents tables (see `@/components/data-table/
 * data-table.tsx`), for visual consistency across the app -- but not
 * rebuilt on that shared TanStack Table component itself: the raw check
 * log is keyset-paginated server-side (this table can grow unbounded, so
 * loading it all client-side to paginate/sort in memory isn't an option)
 * and has the per-row expando disclosure above, neither of which the
 * shared table engine's client-side row model supports. Same reasoning as
 * `GlobalIncidentTable`/`IncidentHistoryTable`.
 *
 * The Region column (#60) surfaces `checks.region`/`is_consensus`: for a
 * multi-region project this table shows every region's own raw diagnostic
 * row (tagged "Regional", `is_consensus: false`) alongside that round's
 * one consensus row (the actual up/down vote `incidents.ts` reads) -- both
 * are real history worth seeing here, not filtered down to consensus-only,
 * but the badge keeps a per-region row from reading as a second, separate
 * outage. `region` is `null` on a multi-region consensus row itself (it
 * represents a majority vote across regions, not any single one) and
 * populated for a manual "run check now" click (whatever region that ad
 * hoc invocation happened to execute in).
 */
export function CheckLogTable({
  projectId,
  page,
  filters,
  incidentCursor,
  incidentDir,
}: {
  projectId: string;
  page: CheckLogPage;
  filters: CheckLogFilters;
  incidentCursor?: string;
  incidentDir?: string;
}) {
  const rateLimitedCount = page.rows.filter((row) => row.is_rate_limited).length;
  const filtersActive = hasActiveCheckLogFilters(filters);

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Check log</CardTitle>
            {rateLimitedCount > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                {rateLimitedCount} rate limited on this page
              </Badge>
            )}
          </div>
          <CardAction className="static flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/projects/${projectId}/checks/export?format=csv`} download>
                <Download />
                CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/projects/${projectId}/checks/export?format=json`} download>
                <Download />
                JSON
              </a>
            </Button>
          </CardAction>
        </div>
        <CheckLogToolbar
          pathname={`/dashboard/projects/${projectId}`}
          filters={filters}
          incidentCursor={incidentCursor}
          incidentDir={incidentDir}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        {page.rows.length === 0 ? (
          <InlineEmptyState
            icon={FileTextIcon}
            title={filtersActive ? "No checks match your filters" : "No checks recorded yet"}
            description={
              filtersActive
                ? "Try a different status or search term."
                : "Once monitoring starts, every health check for this project will show up here."
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">HTTP</TableHead>
                    <TableHead className="hidden md:table-cell">Region</TableHead>
                    <TableHead className="text-right">Response time</TableHead>
                    <TableHead>Checked at</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={row.status} />
                            {row.is_rate_limited && (
                              <Badge variant="outline" className="text-muted-foreground">
                                Rate limited
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {row.http_status ?? "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span>{row.region ?? "—"}</span>
                            {!row.is_consensus && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                                title="One region's own diagnostic result -- the round's actual up/down vote is its separate consensus row."
                              >
                                Regional
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.response_time_ms === null ? "—" : `${row.response_time_ms}ms`}
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground"
                          title={formatDateTime(row.checked_at)}
                        >
                          {formatCheckedAt(row.checked_at)}
                        </TableCell>
                        <TableCell
                          className="max-w-32 truncate text-muted-foreground sm:max-w-64"
                          title={row.error_message ?? undefined}
                        >
                          {row.error_message ?? "—"}
                        </TableCell>
                      </TableRow>
                      {row.response_snippet && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="py-0">
                            <details className="py-1.5">
                              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                View response snippet
                              </summary>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                                {row.response_snippet}
                              </pre>
                            </details>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <CursorPagination
              hasPrevious={page.hasPrevious}
              hasNext={page.hasNext}
              previousHref={pageHref(projectId, page.rows[0].checked_at, "previous", filters)}
              nextHref={pageHref(
                projectId,
                page.rows[page.rows.length - 1].checked_at,
                "next",
                filters,
              )}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
