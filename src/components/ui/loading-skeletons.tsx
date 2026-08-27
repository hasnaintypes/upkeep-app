import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape-matched loading state for a `Card` + `Table` section (Overview,
 * Incidents, API Keys) -- a header row of column-width bars plus N body
 * rows, inside the same `Card` shell the real table renders in, so the
 * page doesn't visibly reflow width/height once data arrives.
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        <div className="flex gap-4 border-b pb-3">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex items-center gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton key={colIndex} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Loading state for a `Card` grid section (Notifications' channel cards,
 * Projects' project cards) -- mimics each card's header/description/footer
 * rows instead of a handful of unrelated gray bars.
 */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
