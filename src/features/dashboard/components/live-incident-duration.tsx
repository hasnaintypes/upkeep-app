"use client";

import { useEffect, useState } from "react";
import { INCIDENT_LIVE_DURATION_TICK_MS } from "../constants";
import { formatIncidentDuration } from "../lib/incident-format";

/** Forces a re-render every `intervalMs` -- the only way an open incident's
 * duration keeps advancing without a full page reload/refetch. No ticking-
 * clock precedent exists elsewhere in this codebase; scoped locally here
 * (and to just the one small cell that needs it, via `LiveIncidentDuration`
 * below) rather than re-rendering a whole table row/page on every tick. */
function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

/** Live "how long has this been going on" duration for a still-open
 * incident (PRD §5.4, Phase 5, #38's "now - start, relative/live"
 * acceptance criterion, reused as-is by #39's global view) -- a resolved
 * incident's duration is fixed and doesn't need this, see the plain
 * `formatIncidentDuration` call at each call site instead. */
export function LiveIncidentDuration({ startedAt }: { startedAt: string }) {
  useTick(INCIDENT_LIVE_DURATION_TICK_MS);
  return <>{formatIncidentDuration(startedAt, new Date())}</>;
}
