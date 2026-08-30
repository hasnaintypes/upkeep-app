import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shared "Newer"/"Older" footer for every keyset (cursor) paginated table in
 * this app (`GlobalIncidentTable`, `IncidentHistoryTable`, `CheckLogTable`)
 * -- these can't use the client-side `DataTablePagination` (see
 * `data-table-pagination.tsx`) since their data is fetched server-side per
 * page, not loaded all at once. Each call site computes its own
 * `nextHref`/`previousHref` (the cursor value and query-param names differ
 * per table -- `checked_at` vs `started_at`, `cursor`/`dir` vs
 * `incidentCursor`/`incidentDir`), so this component only owns the shared
 * layout/disabled-state/`asChild` plumbing, not the href logic itself.
 */
export function CursorPagination({
  hasPrevious,
  hasNext,
  previousHref,
  nextHref,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  previousHref: string;
  nextHref: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" disabled={!hasPrevious} asChild={hasPrevious}>
        {hasPrevious ? <Link href={previousHref}>Newer</Link> : <span>Newer</span>}
      </Button>
      <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
        {hasNext ? <Link href={nextHref}>Older</Link> : <span>Older</span>}
      </Button>
    </div>
  );
}
