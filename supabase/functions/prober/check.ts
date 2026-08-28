// Health-check execution orchestration (PRD §5.2, Phase 3, issues #21-#22;
// plugin-architecture audit/refactor, Phase 11, issue #70).
//
// This module only dispatches to the check type matching a project's own
// `check_type` (see check-types.ts's `CHECK_TYPES` registry) and runs a
// batch of projects concurrently -- it has no per-check-type logic of its
// own. Before #70, `runHealthCheck` below was an `if`/`else if` chain
// branching on `check_type` directly; adding a fifth check type meant
// editing this function (plus classify.ts's and retry.ts's own matching
// chains). Now it's a plain object-key lookup, so a new check type never
// requires a change here -- see ADDING_A_CHECK_TYPE.md for the exact
// steps.
//
// `CheckType`/`DueProject`/`CheckResult` are defined in check-types.ts,
// not here, and re-exported below unchanged so every other module in this
// directory that already imports them `from "./check.ts"` keeps working
// without an import-path change -- only the check-type-specific runner
// functions (`runHttpCheck`/`runTcpCheck`/`runDnsCheck`/`runSslCheck`,
// already private/unexported before this refactor) actually moved.
import { CHECK_TYPES } from "./check-types.ts";
import type { CheckResult, DueProject } from "./check-types.ts";

export type { CheckType, CheckResult, DueProject } from "./check-types.ts";

/** Dispatches to the check type matching `project.check_type` -- the one
 * thing every other module in this pipeline (retry.ts/classify.ts/
 * persist.ts) calls or reasons about, so none of them needs its own
 * check_type branch just to fire the request. */
export function runHealthCheck(project: DueProject): Promise<CheckResult> {
  return CHECK_TYPES[project.check_type].run(project);
}

/**
 * Runs health checks for every due project concurrently -- not
 * sequentially -- so N projects don't each pay for the others' latency
 * within one prober tick. `Promise.allSettled` (rather than `Promise.all`)
 * is defensive: every check type's own `run` is written to never reject,
 * but a batch here still shouldn't be able to abort partway through if it
 * somehow did.
 */
export async function runHealthChecks(
  projects: DueProject[],
): Promise<CheckResult[]> {
  const settled = await Promise.allSettled(projects.map(runHealthCheck));

  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          project_id: projects[index].id,
          http_status: null,
          response_time_ms: 0,
          response_snippet: null,
          error_message:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error",
          timed_out: false,
          attempts: 1,
        },
  );
}
