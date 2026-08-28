import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape-matched loading state for a `DataTable` consumer -- a toolbar bar
 * (search box + a couple of filter-dropdown-shaped controls), the same
 * bordered table shell the real table renders in (header bar + N body
 * rows), and a pagination bar, so the page doesn't reflow once data
 * arrives. Lives alongside the reusable `data-table/` kit (not the
 * projects feature) so any future `DataTable` consumer can reuse it
 * instead of reaching for the unrelated `CardGridSkeleton`.
 */
export function DataTableSkeleton({
  columnCount = 5,
  rowCount = 10,
}: {
  columnCount?: number;
  rowCount?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
          {Array.from({ length: columnCount }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0"
            >
              {Array.from({ length: columnCount }).map((_, colIndex) => (
                <Skeleton key={colIndex} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col-reverse items-center justify-between gap-4 sm:flex-row">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}
