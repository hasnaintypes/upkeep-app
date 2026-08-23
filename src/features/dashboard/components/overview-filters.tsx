import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CheckStatus } from "@/features/projects";
import { STATUS_META } from "../constants";
import { hasActiveFilters, toggleFilterHref, type OverviewFilters } from "../lib/filters";
import { OverviewSearchInput } from "./overview-search-input";

const STATUS_OPTIONS: CheckStatus[] = ["up", "degraded", "waking", "down", "unknown"];

/** One toggle chip: a plain `<Link>` that adds/removes `value` from the
 * given facet in the current URL, styled active/inactive from state
 * already known server-side -- no client JS needed for tag/provider/status
 * filtering (only the search box is a Client Component). */
function FilterChip({
  href,
  active,
  variant,
  children,
}: {
  href: string;
  active: boolean;
  variant: "default" | "secondary" | "destructive" | "outline";
  children: React.ReactNode;
}) {
  return (
    <Badge asChild variant={active ? variant : "outline"} className="cursor-pointer gap-1">
      <Link href={href} scroll={false}>
        {children}
      </Link>
    </Badge>
  );
}

/**
 * Filter/search bar for the dashboard overview page (PRD §5.6, Phase 4,
 * #33): free-text name search, and multi-select tag/hosting-provider/
 * status chips. Filter state lives entirely in the URL's query params
 * (parsed by `parseOverviewFilters`, applied by `filterOverviewRows` in
 * `dashboard/page.tsx`) -- this component only reads and renders it.
 *
 * `availableTags`/`availableProviders` are derived from the signed-in
 * user's own active projects (see `getAvailableTags`/`getAvailableProviders`
 * in lib/filters.ts), not a hardcoded list -- an option only ever appears
 * here if at least one of the user's projects actually has it.
 */
export function OverviewFilterBar({
  filters,
  availableTags,
  availableProviders,
  pathname,
}: {
  filters: OverviewFilters;
  availableTags: string[];
  availableProviders: string[];
  pathname: string;
}) {
  const hasFacets = availableTags.length > 0 || availableProviders.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <OverviewSearchInput defaultValue={filters.q} />
        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={pathname}>Clear filters</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          {STATUS_OPTIONS.map((status) => (
            <FilterChip
              key={status}
              href={toggleFilterHref(pathname, filters, "statuses", status)}
              active={filters.statuses.includes(status)}
              variant={STATUS_META[status].badgeVariant}
            >
              {STATUS_META[status].label}
            </FilterChip>
          ))}
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Tags</span>
            {availableTags.map((tag) => (
              <FilterChip
                key={tag}
                href={toggleFilterHref(pathname, filters, "tags", tag)}
                active={filters.tags.includes(tag)}
                variant="default"
              >
                {tag}
              </FilterChip>
            ))}
          </div>
        )}

        {availableProviders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Hosting</span>
            {availableProviders.map((provider) => (
              <FilterChip
                key={provider}
                href={toggleFilterHref(pathname, filters, "providers", provider)}
                active={filters.providers.includes(provider)}
                variant="default"
              >
                {provider}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {!hasFacets && (
        <p className="text-xs text-muted-foreground">
          Add tags or a hosting provider to your projects to filter by them here.
        </p>
      )}
    </div>
  );
}
