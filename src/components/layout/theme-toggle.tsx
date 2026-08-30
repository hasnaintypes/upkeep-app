"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Light/dark/system theme switcher (PRD §5.6's "dark/light theme toggle" --
 * spec'd but, until now, unbuilt: `next-themes`' `<ThemeProvider>` has been
 * wired up app-wide since the Tailwind v4 migration, defaulting to
 * `system`, with no control anywhere for a user to override it). Lives
 * here under `components/layout` per this project's own architecture
 * convention (AGENTS.md: cross-feature app chrome, not a specific
 * feature's concern), not under `features/settings` -- there is no
 * `features/settings` module (the Settings page directly composes other
 * features' components), and this preference isn't backed by any table
 * row either; `next-themes` persists it to `localStorage` itself, which is
 * sufficient for a single-user self-hosted deployment (no `profiles`
 * table exists to sync it across devices, and adding one for this alone
 * would be speculative).
 *
 * Renders a loading placeholder until mounted -- `useTheme()`'s `theme`
 * value is only resolved client-side (it depends on `localStorage`, which
 * doesn't exist during SSR), so rendering the real toggle before that
 * would either show a wrong initial selection or trip a hydration
 * mismatch the moment it resolves.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Skeleton className="h-9 w-64" />;
  }

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => value && setTheme(value)}
      variant="outline"
      aria-label="Theme"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
