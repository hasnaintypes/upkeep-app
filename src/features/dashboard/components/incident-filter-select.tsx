"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { incidentFilterHref } from "../lib/incident-filters";
import type { GlobalIncidentFilters } from "../types";

const ALL_VALUE = "__all__";

/**
 * One single-select facet for the global incident view's filter bar (PRD
 * §5.4, Phase 5, #39) -- project/status/time-range are each naturally
 * one-at-a-time, unlike the overview page's multi-select tag/provider/
 * status toggle chips (#33), so a shadcn `Select` fits better here than
 * more `<Link>` chips would.
 *
 * Radix `Select` has no native `<select>`/form-GET semantics to build a
 * plain `<Link>` href per option the way `FilterChip` does, so this is a
 * small Client Component that navigates via `router.push` on change --
 * immediate (not debounced) since selecting an option is already a
 * complete, deliberate action, unlike the free-text search box's
 * keystroke-by-keystroke typing (`OverviewSearchInput`).
 *
 * Takes plain serializable props (`pathname`/`filters`/`filterKey`) and
 * calls `incidentFilterHref` itself rather than accepting an `hrefFor`
 * callback prop -- functions can't cross the Server->Client Component
 * boundary, and `IncidentFilterBar` (this component's only caller) has no
 * other reason to be a Client Component itself.
 */
export function IncidentFilterSelect({
  label,
  value,
  placeholder,
  options,
  pathname,
  filters,
  filterKey,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  options: { value: string; label: string }[];
  pathname: string;
  filters: GlobalIncidentFilters;
  filterKey: "projectId" | "status" | "since";
}) {
  const router = useRouter();

  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) => {
        const nextValue = next === ALL_VALUE ? null : next;
        router.push(incidentFilterHref(pathname, filters, filterKey, nextValue), {
          scroll: false,
        });
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-auto min-w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
