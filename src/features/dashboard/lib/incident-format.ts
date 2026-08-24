/**
 * Shared incident display formatting (PRD §5.4, Phase 5, #37/#38/#39) --
 * used by both the per-project (`IncidentHistoryTable`, #38) and global
 * (`GlobalIncidentTable`, #39) incident views so the two stay visually
 * consistent and don't duplicate these pure functions.
 */

export function formatIncidentDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2h 15m"-style duration, coarsest-two-units only (matches
 * `formatRelativeTime`'s own compactness, lib/utils.ts). Takes an explicit
 * end instant rather than always reading `Date.now()` internally, so the
 * same function covers both a resolved incident's fixed `resolved_at` and
 * an open incident's live, ticking "now" (see `LiveIncidentDuration`). */
export function formatIncidentDuration(startedAt: string, end: Date | string): string {
  const endMs = typeof end === "string" ? new Date(end).getTime() : end.getTime();
  const elapsedMs = Math.max(0, endMs - new Date(startedAt).getTime());
  const totalMinutes = Math.round(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}
