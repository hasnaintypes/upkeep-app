import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Full-height "nothing here yet" placeholder for a dashboard page/section.
 * `flex-1` so it stretches to fill whatever remaining vertical space its
 * flex-column parent has (the page's own root div, or a table's Card slot),
 * rather than the old fixed `p-6/p-10` box that left most of the page blank
 * below it -- see the screenshot in issue discussion for the box it replaces.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      variant="soft"
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-background shadow-sm">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </Card>
  );
}
