// HTTP health-check execution (PRD §5.2, Phase 3, issues #21-#22).
//
// Scope note: this module only fires the request and captures the raw
// result. It deliberately does NOT do status classification (up/down/
// degraded/waking/unknown) or retry-on-failure, and doesn't write anything
// to the `checks` table -- those are separate, later Phase 3 tasks per
// docs/ROADMAP.md, and mixing them in here would make each one harder to
// reason about and test independently.
//
// Per-project timeout enforcement (#22): each request is aborted via
// AbortController at exactly `project.timeout_ms` -- never a hardcoded
// global value -- and a timeout is reported via the distinct `timed_out`
// flag on CheckResult, not just embedded in `error_message` text. A future
// status-classification step should branch on `timed_out` directly rather
// than string-matching the message (e.g. for "unknown" vs "down").

/** The subset of a `projects` row this module needs. Kept minimal and
 * local rather than importing the Next.js app's generated Database type --
 * this Edge Function is a separate Deno runtime/module graph. */
export type DueProject = {
  id: string;
  health_url: string;
  method: string;
  headers: unknown;
  timeout_ms: number;
  body: string | null;
  retry_count: number;
  expected_status: number;
};

export type CheckResult = {
  project_id: string;
  http_status: number | null;
  response_time_ms: number;
  response_snippet: string | null;
  error_message: string | null;
  /** True only when the request was aborted for exceeding project.timeout_ms
   * -- a structured, machine-readable signal so a later status-classification
   * step can react to "timed out" without parsing error_message text. Never
   * true alongside a successful response. */
  timed_out: boolean;
  /** How many attempts this result represents. Always 1 from runHealthCheck
   * itself (a single attempt); retry.ts overwrites this on the final result
   * it returns so callers can see whether a retry was needed (#23). */
  attempts: number;
};

/** Matches the `checks.response_snippet` column's intended use (PRD §6) --
 * captured for later status classification (e.g. `expected_body_match`),
 * not stored in full to keep row sizes bounded. */
const RESPONSE_SNIPPET_MAX_LENGTH = 2000;

function toHeaderRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Fires one health-check HTTP request and captures its raw result. Never
 * throws -- every failure mode (network error, timeout, non-2xx status)
 * resolves to a CheckResult with `error_message` set instead, so a single
 * bad project can't take down a concurrent batch (see index.ts).
 */
export async function runHealthCheck(project: DueProject): Promise<CheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), project.timeout_ms);
  const startedAt = performance.now();

  try {
    const response = await fetch(project.health_url, {
      method: project.method,
      headers: toHeaderRecord(project.headers),
      // GET/HEAD requests must not carry a body -- fetch() throws
      // ("Request with GET/HEAD method cannot have body") if you try, so
      // this is only included for methods that actually support one.
      ...(project.method !== "GET" && project.method !== "HEAD" && project.body
        ? { body: project.body }
        : {}),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    // Timing intentionally stops after reading the body, not right after
    // headers arrive -- a slow-streaming response is still a slow check.
    const responseTimeMs = Math.round(performance.now() - startedAt);

    return {
      project_id: project.id,
      http_status: response.status,
      response_time_ms: responseTimeMs,
      response_snippet: bodyText.slice(0, RESPONSE_SNIPPET_MAX_LENGTH) || null,
      error_message: null,
      timed_out: false,
      attempts: 1,
    };
  } catch (err) {
    const responseTimeMs = Math.round(performance.now() - startedAt);
    // AbortError is exactly and only what our own timeout abort() produces
    // here (no other abort trigger exists in this function), so it's a
    // reliable signal that this specific failure was a timeout, not some
    // other network error (DNS failure, connection refused, TLS error, etc).
    const isTimeout = err instanceof Error && err.name === "AbortError";

    return {
      project_id: project.id,
      http_status: null,
      response_time_ms: responseTimeMs,
      response_snippet: null,
      error_message: isTimeout
        ? `Timed out after ${project.timeout_ms}ms`
        : err instanceof Error
          ? err.message
          : "Unknown error",
      timed_out: isTimeout,
      attempts: 1,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Runs health checks for every due project concurrently -- not
 * sequentially -- so N projects don't each pay for the others' latency
 * within one prober tick. `Promise.allSettled` (rather than `Promise.all`)
 * is defensive: `runHealthCheck` is written to never reject, but a batch
 * here still shouldn't be able to abort partway through if it somehow did.
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
