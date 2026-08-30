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
 * Loading state for a row of label-over-value stat cards (dashboard
 * overview's `OverviewStats`) -- same 2/4-column grid and card shell the
 * real stats render in, so the page doesn't reflow once data arrives.
 */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Loading state for a chart `Card` (response-time graph, uptime heatmap,
 * portfolio incidents chart) -- title/description bars plus one tall block
 * standing in for the chart area, at the same height so the page doesn't
 * jump once the real chart mounts.
 */
export function ChartCardSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className={`w-full ${height}`} />
      </CardContent>
    </Card>
  );
}

/**
 * Loading state for the notification channels grid (`ChannelList`) -- an
 * icon-square + title/switch row, a description line, and a two-icon action
 * row, matching that card's real shape (icon square for the channel type,
 * `Switch`-sized pill for active/inactive, `Pencil`/`Trash2` icon buttons)
 * instead of generic bars. Also renders the same "N channels" + "Add
 * channel" header row `ChannelList` itself shows once loaded, so the whole
 * section's layout is stable across the loading -> loaded transition.
 */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <Skeleton className="h-5 w-24" />
                </div>
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
    </div>
  );
}
