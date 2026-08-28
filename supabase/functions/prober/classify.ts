// Status classification orchestration (PRD §5.2, Phase 3, issue #24;
// plugin-architecture audit/refactor, Phase 11, issue #70): maps a
// check's raw outcome to one of up/down/degraded/waking/unknown by
// delegating to the check type matching `project.check_type` (see
// check-types.ts's `CHECK_TYPES` registry).
//
// Before #70, `classifyCheck` below was an `if`/`else if` chain branching
// on `check_type` directly (tcp/dns/ssl each an early-return branch,
// falling through to HTTP-specific rules otherwise). Adding a fifth check
// type meant editing this function (plus check.ts's and retry.ts's own
// matching chains). Now it's a plain object-key lookup -- see
// ADDING_A_CHECK_TYPE.md for the exact steps a new check type needs.
//
// `CheckStatus`/`ClassifiableProject` are defined in check-types.ts, not
// here, and re-exported below unchanged so every other module that
// already imports them `from "./classify.ts"` (persist.ts,
// region-probe.ts) keeps working without an import-path change.
import { CHECK_TYPES } from "./check-types.ts";
import type { CheckResult } from "./check.ts";
import type { CheckStatus, ClassifiableProject } from "./check-types.ts";

export type { CheckStatus, ClassifiableProject } from "./check-types.ts";

/**
 * Pure function: raw check outcome + the project's expectation in, one of
 * the five status values out. No I/O, no Supabase/Deno globals -- callable
 * and unit-testable without an Edge Function invocation. Delegates
 * entirely to the matching check type's own `classify` -- this function
 * itself has no per-check-type rules of its own anymore (see http.ts/
 * tcp.ts/dns.ts/ssl.ts for those).
 */
export function classifyCheck(
  result: CheckResult,
  project: ClassifiableProject,
): CheckStatus {
  return CHECK_TYPES[project.check_type].classify(result, project);
}
