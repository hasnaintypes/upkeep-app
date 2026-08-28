import type { Project } from "../types";

/**
 * Distinct hosting providers across the given projects, sorted -- derived
 * from the signed-in user's actual data (there's no fixed enum backing
 * `hosting_provider`, it's freeform text) rather than a hardcoded option
 * list, so the table's "Hosting provider" filter dropdown only ever offers
 * values that actually exist. Same "derive, don't hardcode" reasoning as
 * the dashboard overview page's own `getAvailableProviders` -- kept as a
 * separate copy here (not imported cross-feature) since `features/projects`
 * is meant to be self-contained.
 */
export function getAvailableHostingProviders(projects: Project[]): string[] {
  return Array.from(
    new Set(projects.map((p) => p.hosting_provider).filter((p): p is string => !!p?.trim())),
  ).sort((a, b) => a.localeCompare(b));
}

/** Distinct tags across the given projects, sorted -- same reasoning as
 * `getAvailableHostingProviders`, for the table's multi-select "Tags"
 * filter dropdown. */
export function getAvailableTags(projects: Project[]): string[] {
  return Array.from(new Set(projects.flatMap((p) => p.tags ?? []))).sort((a, b) =>
    a.localeCompare(b),
  );
}
