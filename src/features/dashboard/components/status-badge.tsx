import { Badge } from "@/components/ui/badge";
import type { CheckStatus } from "@/features/projects";
import { STATUS_META } from "../constants";

/**
 * Color + icon + text label for a check status (PRD §5.2, #29). Deliberately
 * never color-only: `STATUS_META`'s comment explains why the icon and label
 * matter as much as the badge color here (degraded/waking share a color
 * today) -- this is what the issue's "accessible color scheme (not
 * color-alone)" acceptance criterion is actually asking for.
 */
export function StatusBadge({ status }: { status: CheckStatus | null }) {
  const meta = STATUS_META[status ?? "unknown"];
  const Icon = meta.icon;

  return (
    <Badge variant={meta.badgeVariant} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {status === null ? "No checks yet" : meta.label}
    </Badge>
  );
}
