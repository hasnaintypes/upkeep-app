import { Fragment } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import type { CheckLogPage } from "../types";

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
 * params (`cursor`/`dir`), read back by the page's own loader. */
function pageHref(projectId: string, checkedAt: string, direction: "next" | "previous"): string {
  const params = new URLSearchParams({ cursor: checkedAt, dir: direction });
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
 */
export function CheckLogTable({
  projectId,
  page,
}: {
  projectId: string;
  page: CheckLogPage;
}) {
  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>Check log</CardTitle>
        <CardAction className="flex gap-2">
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
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checks recorded yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">HTTP</TableHead>
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
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.response_time_ms === null ? "—" : `${row.response_time_ms}ms`}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        title={new Date(row.checked_at).toLocaleString()}
                      >
                        {formatCheckedAt(row.checked_at)}
                      </TableCell>
                      <TableCell className="max-w-32 truncate text-muted-foreground sm:max-w-64">
                        {row.error_message ?? "—"}
                      </TableCell>
                    </TableRow>
                    {row.response_snippet && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="py-0">
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
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!page.hasPrevious}
                asChild={page.hasPrevious}
              >
                {page.hasPrevious ? (
                  <Link href={pageHref(projectId, page.rows[0].checked_at, "previous")}>
                    Newer
                  </Link>
                ) : (
                  <span>Newer</span>
                )}
              </Button>
              <Button variant="outline" size="sm" disabled={!page.hasNext} asChild={page.hasNext}>
                {page.hasNext ? (
                  <Link
                    href={pageHref(projectId, page.rows[page.rows.length - 1].checked_at, "next")}
                  >
                    Older
                  </Link>
                ) : (
                  <span>Older</span>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
