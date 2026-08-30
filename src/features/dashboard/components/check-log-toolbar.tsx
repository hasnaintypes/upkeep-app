"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CheckStatus } from "@/features/projects";
import { checkLogFilterHref, hasActiveCheckLogFilters } from "../lib/check-log-filters";
import { STATUS_META } from "../constants";
import type { CheckLogFilters } from "../types";

const ALL_VALUE = "__all__";
const STATUS_OPTIONS: CheckStatus[] = ["up", "down", "degraded", "waking", "unknown"];

/**
 * Filter toolbar for the per-project check log (#32 follow-up): a status
 * select and a submit-on-Enter error search, both URL-driven
 * (`checkLogFilterHref`) so the filtered view stays shareable/refresh-safe --
 * same reasoning as the global incident view's own filter bar
 * (`IncidentFilterBar`/`IncidentFilterSelect`). The search box navigates on
 * submit, not per keystroke, for the same reason `IncidentFilterSelect`'s
 * own doc comment gives for its select: typing a query is a keystroke-by-
 * keystroke process, not a single deliberate action like picking a status.
 */
export function CheckLogToolbar({
  pathname,
  filters,
  incidentCursor,
  incidentDir,
}: {
  pathname: string;
  filters: CheckLogFilters;
  incidentCursor?: string;
  incidentDir?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q ?? "");
  const preserve = { incidentCursor, incidentDir };

  function navigate(key: "status" | "q", value: string | null) {
    router.push(checkLogFilterHref(pathname, filters, key, value, preserve), { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative w-full sm:w-56"
        onSubmit={(e) => {
          e.preventDefault();
          navigate("q", query.trim() || null);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search errors..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8"
        />
      </form>
      <Select
        value={filters.status ?? ALL_VALUE}
        onValueChange={(next) => navigate("status", next === ALL_VALUE ? null : next)}
      >
        <SelectTrigger size="sm" aria-label="Filter by status" className="w-auto min-w-32">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_META[status].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActiveCheckLogFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            const params = new URLSearchParams();
            if (incidentCursor) params.set("incidentCursor", incidentCursor);
            if (incidentDir) params.set("incidentDir", incidentDir);
            const qs = params.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          }}
        >
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
