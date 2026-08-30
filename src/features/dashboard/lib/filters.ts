import type { Project } from "@/features/projects";

/** Distinct tags across the given projects, sorted -- derived from the
 * signed-in user's actual data (not a hardcoded list), per issue #33's
 * acceptance criteria. Computed from the *unfiltered* project list so a
 * facet's own available options don't shrink as other filters are
 * applied -- same reasoning as `features/projects/lib/filters.ts`'s own
 * copy, kept separate since `features/dashboard` is meant to be
 * self-contained. */
export function getAvailableTags(projects: Project[]): string[] {
  return Array.from(new Set(projects.flatMap((p) => p.tags ?? []))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Distinct hosting providers across the given projects, sorted -- same
 * "derived from real data" reasoning as `getAvailableTags`. */
export function getAvailableProviders(projects: Project[]): string[] {
  return Array.from(
    new Set(projects.map((p) => p.hosting_provider).filter((p): p is string => !!p?.trim())),
  ).sort((a, b) => a.localeCompare(b));
}
