"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/**
 * Free-text project-name search for the overview page (PRD §5.6, Phase 4,
 * #33) -- the one piece of real client interactivity in the filter bar
 * (tag/provider/status are plain `<Link>` toggle chips, see
 * `overview-filters.tsx`). Debounced and synced to the `q` URL param via
 * `router.replace` (not `push`) so typing doesn't spam browser history with
 * an entry per keystroke, while every other active filter in the URL is
 * preserved untouched.
 */
export function OverviewSearchInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip on mount -- `defaultValue` already reflects the URL, no need to
    // immediately re-navigate to the state we're already in.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `value` should re-trigger the debounce; re-running on every searchParams/router identity change would fight other filter navigations.
  }, [value]);

  return (
    <div className="relative w-full max-w-64">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search projects..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-8"
        aria-label="Search projects by name"
      />
    </div>
  );
}
