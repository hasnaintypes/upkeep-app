import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True for absolute http(s) URLs, false for in-page anchors/relative paths. */
export function isExternalUrl(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Largest-to-smallest units `formatRelativeTime` steps through, each paired
 * with its length in seconds and the compact abbreviation to render it
 * with (e.g. "2m ago", matching the dashboard overview's "last checked"
 * column, #29). */
const RELATIVE_TIME_UNITS: { abbreviation: string; seconds: number }[] = [
  { abbreviation: "y", seconds: 60 * 60 * 24 * 365 },
  { abbreviation: "mo", seconds: 60 * 60 * 24 * 30 },
  { abbreviation: "d", seconds: 60 * 60 * 24 },
  { abbreviation: "h", seconds: 60 * 60 },
  { abbreviation: "m", seconds: 60 },
];

/**
 * Formats a past timestamp as a short relative string (e.g. "2m ago",
 * "3d ago") for the dashboard overview's "last checked" column (#29).
 * Hand-rolled rather than adding a date library (no `date-fns`/`dayjs`
 * dependency exists in this project, and one relative-time string is too
 * small a need to justify adding one) -- and rather than
 * `Intl.RelativeTimeFormat`, which has no built-in style that produces this
 * compact "2m ago" form (its `numeric: "always"` output is "2 minutes ago";
 * `style: "narrow"` only trims the "in"/"ago" phrasing, not the unit word).
 */
export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const elapsedSeconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (elapsedSeconds < 45) {
    return "just now";
  }

  for (const { abbreviation, seconds } of RELATIVE_TIME_UNITS) {
    const value = Math.floor(elapsedSeconds / seconds);
    if (value >= 1) {
      return `${value}${abbreviation} ago`;
    }
  }

  return `${Math.max(1, Math.round(elapsedSeconds / 60))}m ago`;
}

/**
 * Formats a full date/time with a fixed, explicit locale (e.g. for a
 * relative-time span's `title` tooltip) -- a bare `toLocaleString()` uses
 * the runtime's default locale, which differs between the server process
 * and a visitor's browser (e.g. "8/25/2026, 6:17 PM" vs
 * "25/08/2026, 6:17 pm"). In a Client Component that's rendered on the
 * server and then hydrated, that mismatch trips React's hydration-mismatch
 * warning even though the two strings represent the same instant -- pinning
 * the locale here makes the server- and client-rendered strings identical.
 */
export function formatDateTime(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
