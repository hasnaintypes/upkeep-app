"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DataTableFilterOption = {
  label: string;
  value: string;
};

/**
 * Generic filter dropdown for a data table toolbar -- same
 * `DropdownMenuCheckboxItem`-based building block as `DataTableViewOptions`
 * ("Customize columns"), just pointed at filtering a column's values
 * instead of toggling column visibility.
 *
 * `multiple` is the switch a caller uses to decide how this behaves per
 * filter, not a fixed choice baked into the component: `false` (default)
 * is a single-select "All {title}" dropdown (picking a value replaces the
 * selection, picking the same value again clears it) for a fixed 2-3
 * value facet like Status; `true` is a multi-select facet (toggles values
 * in/out of the selection) for an open-ended facet like Tags. Both modes
 * share one implementation so a table only reaches for the extra
 * multi-select affordance where it actually needs it.
 */
export function DataTableFilter({
  title,
  options,
  selected,
  onChange,
  multiple = false,
}: {
  title: string;
  options: DataTableFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
}) {
  if (options.length === 0) return null;

  function toggle(value: string) {
    if (multiple) {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value],
      );
      return;
    }
    onChange(selected.includes(value) ? [] : [value]);
  }

  const summary =
    selected.length === 0
      ? `All ${title.toLowerCase()}`
      : multiple && selected.length > 1
        ? `${title} (${selected.length})`
        : (options.find((option) => option.value === selected[0])?.label ?? title);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 justify-between gap-2">
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => toggle(option.value)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
