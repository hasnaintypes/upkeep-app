// Unit tests for http.ts -- run(), classify(), and isAttemptSuccessful()
// for the HTTP check type (#21-#22, #24, #58, #59). Split out of the
// former check.test.ts/classify.test.ts as part of #70's plugin-
// architecture refactor -- see that issue's ADDING_A_CHECK_TYPE.md for
// the convention this file follows.
import { assertEquals } from "@std/assert";
import { runHttpCheck, classifyHttp, isHttpAttemptSuccessful } from "./http.ts";
import type { CheckResult, ClassifiableProject, DueProject } from "./check-types.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "https://example.test/health",
    method: "GET",
    headers: null,
    timeout_ms: 200,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "http",
    check_interval_seconds: 300,
    rate_limit_backoff_count: 0,
    expected_body_match: null,
    expected_json_path: null,
    expected_json_value: null,
    ...overrides,
  };
}

function fakeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    project_id: "test-project",
    http_status: 200,
    response_time_ms: 100,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

const classifiableProject: ClassifiableProject = { expected_status: 200, check_type: "http" };

// --- runHttpCheck ---------------------------------------------------------

Deno.test("runHttpCheck: successful request -> http_status set, no error", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject());
    assertEquals(fetchCalled, true);
    assertEquals(result.http_status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_body_match set and present in body -> bodyMatchFailed false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("status: ok, all systems healthy", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject({ expected_body_match: "all systems healthy" }));
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_body_match set but missing from body -> bodyMatchFailed true, even with matching status (#58 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("<html>maintenance page</html>", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_status: 200, expected_body_match: "all systems healthy" }),
    );
    assertEquals(result.http_status, 200);
    assertEquals(result.bodyMatchFailed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_body_match unset -> bodyMatchFailed always false (#58 backward-compat AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("anything at all", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject({ expected_body_match: null }));
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_body_match found beyond the truncated response_snippet -> still correctly matched against the full body (#58)", async () => {
  // response_snippet is truncated to 2000 chars (RESPONSE_SNIPPET_MAX_LENGTH)
  // -- the match itself must still be checked against the *full* body, not
  // that truncated snippet, or a match string past the cutoff would be
  // wrongly reported as missing.
  const padding = "x".repeat(2500);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(`${padding}all systems healthy`, { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject({ expected_body_match: "all systems healthy" }));
    assertEquals(result.bodyMatchFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path/value set and matching -> jsonAssertionFailed false, error_message still null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
    assertEquals(result.error_message, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path/value set but value mismatches -> jsonAssertionFailed true, mismatch captured (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "degraded" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.http_status, 200);
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError, 'JSON path "$.status" expected "ok", got "degraded".');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path set but body isn't valid JSON -> jsonAssertionFailed true, parse error captured (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("<html>not json</html>", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError?.startsWith("Response body is not valid JSON"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path set but path missing from body -> jsonAssertionFailed true (#59 AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ other: "field" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: "$.status", expected_json_value: "ok" }),
    );
    assertEquals(result.jsonAssertionFailed, true);
    assertEquals(result.jsonAssertionError, 'JSON path "$.status" not found in response body.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path/value unset -> jsonAssertionFailed always false (#59 backward-compat AC)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("anything at all", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: null, expected_json_value: null }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- response_snippet / HTML content-type handling --------------------------

Deno.test("runHttpCheck: text/html content-type -> response_snippet is a placeholder, not the raw markup", async () => {
  const originalFetch = globalThis.fetch;
  const html = "<html><body><h1>Not Found</h1></body></html>";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(html, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }),
    )) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject());
    assertEquals(result.response_snippet?.includes("<html>"), false);
    assertEquals(result.response_snippet?.includes("HTML response omitted"), true);
    assertEquals(result.response_snippet?.includes(`${html.length} characters`), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: text/html content-type -> expected_body_match is still checked against the full raw body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("<html>all systems healthy</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    )) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject({ expected_body_match: "all systems healthy" }));
    // The assertion result proves the match ran against the full HTML body
    // even though response_snippet itself was replaced with a placeholder.
    assertEquals(result.bodyMatchFailed, false);
    assertEquals(result.response_snippet?.includes("HTML response omitted"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: non-HTML content-type (application/json) -> response_snippet keeps the existing truncated-body behavior", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject());
    assertEquals(result.response_snippet, JSON.stringify({ status: "ok" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: no content-type header -> response_snippet keeps the existing truncated-body behavior", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("plain text body", { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject());
    assertEquals(result.response_snippet, "plain text body");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: empty body with text/html content-type -> response_snippet is null, not a placeholder", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("", { status: 200, headers: { "content-type": "text/html" } }))) as typeof fetch;

  try {
    const result = await runHttpCheck(fakeProject());
    assertEquals(result.response_snippet, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runHttpCheck: expected_json_path set but expected_json_value unset -> treated as not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ status: "down" }), { status: 200 }))) as typeof fetch;

  try {
    const result = await runHttpCheck(
      fakeProject({ expected_json_path: "$.status", expected_json_value: null }),
    );
    assertEquals(result.jsonAssertionFailed, false);
    assertEquals(result.jsonAssertionError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- classifyHttp ----------------------------------------------------------

Deno.test("classifyHttp: fast, matching status -> up", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 250 }), classifiableProject), "up");
});

Deno.test("classifyHttp: exactly at the degraded threshold -> up (not yet degraded)", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 3000 }), classifiableProject), "up");
});

Deno.test("classifyHttp: just over the degraded threshold -> degraded", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 3001 }), classifiableProject), "degraded");
});

Deno.test("classifyHttp: exactly at the waking threshold -> degraded (not yet waking)", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 7000 }), classifiableProject), "degraded");
});

Deno.test("classifyHttp: just over the waking threshold -> waking", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 7001 }), classifiableProject), "waking");
});

Deno.test("classifyHttp: wrong http_status (fast, no error) -> down, not up", () => {
  assertEquals(
    classifyHttp(fakeResult({ http_status: 500, response_time_ms: 50 }), classifiableProject),
    "down",
  );
});

Deno.test("classifyHttp: timed out -> down, not waking or unknown", () => {
  assertEquals(
    classifyHttp(
      fakeResult({
        http_status: null,
        timed_out: true,
        error_message: "Timed out after 10000ms",
        response_time_ms: 10002,
      }),
      classifiableProject,
    ),
    "down",
  );
});

Deno.test("classifyHttp: DNS/network error (not a timeout) -> unknown, not down", () => {
  assertEquals(
    classifyHttp(
      fakeResult({
        http_status: null,
        timed_out: false,
        error_message: "dns error: failed to lookup address information",
        response_time_ms: 4,
      }),
      classifiableProject,
    ),
    "unknown",
  );
});

Deno.test("classifyHttp: a slow response that still matches expected_status is never unknown or down", () => {
  assertEquals(classifyHttp(fakeResult({ response_time_ms: 9000 }), classifiableProject), "waking");
});

// #58: expected_body_match -- a matching status with the wrong body is
// `down`, regardless of response time (checked before the degraded/waking
// thresholds, since a wrong-content response isn't "successful but slow").
Deno.test("classifyHttp: bodyMatchFailed true, matching status -> down, even though status matched", () => {
  assertEquals(classifyHttp(fakeResult({ bodyMatchFailed: true }), classifiableProject), "down");
});

Deno.test("classifyHttp: bodyMatchFailed true takes priority over an otherwise-fast/matching response", () => {
  assertEquals(
    classifyHttp(fakeResult({ bodyMatchFailed: true, response_time_ms: 10 }), classifiableProject),
    "down",
  );
});

Deno.test("classifyHttp: bodyMatchFailed false (or unset) -> normal classification, unaffected (#58 backward-compat AC)", () => {
  assertEquals(
    classifyHttp(fakeResult({ bodyMatchFailed: false, response_time_ms: 250 }), classifiableProject),
    "up",
  );
  assertEquals(
    classifyHttp(fakeResult({ response_time_ms: 250 }), classifiableProject), // bodyMatchFailed omitted entirely
    "up",
  );
});

Deno.test("classifyHttp: wrong http_status takes priority over bodyMatchFailed (both down, but for the reported reason to make sense)", () => {
  assertEquals(
    classifyHttp(fakeResult({ http_status: 500, bodyMatchFailed: true }), classifiableProject),
    "down",
  );
});

// #59: expected_json_path/expected_json_value -- a matching status with a
// failed JSON path/value assertion is `down`, same placement/priority as
// #58's bodyMatchFailed above.
Deno.test("classifyHttp: jsonAssertionFailed true, matching status -> down, even though status matched", () => {
  assertEquals(classifyHttp(fakeResult({ jsonAssertionFailed: true }), classifiableProject), "down");
});

Deno.test("classifyHttp: jsonAssertionFailed true takes priority over an otherwise-fast/matching response", () => {
  assertEquals(
    classifyHttp(fakeResult({ jsonAssertionFailed: true, response_time_ms: 10 }), classifiableProject),
    "down",
  );
});

Deno.test("classifyHttp: jsonAssertionFailed false (or unset) -> normal classification, unaffected (#59 backward-compat AC)", () => {
  assertEquals(
    classifyHttp(fakeResult({ jsonAssertionFailed: false, response_time_ms: 250 }), classifiableProject),
    "up",
  );
  assertEquals(
    classifyHttp(fakeResult({ response_time_ms: 250 }), classifiableProject), // jsonAssertionFailed omitted entirely
    "up",
  );
});

Deno.test("classifyHttp: wrong http_status takes priority over jsonAssertionFailed (both down, but for the reported reason to make sense)", () => {
  assertEquals(
    classifyHttp(fakeResult({ http_status: 500, jsonAssertionFailed: true }), classifiableProject),
    "down",
  );
});

// --- isHttpAttemptSuccessful ------------------------------------------------
// No dedicated test file exists for retry.ts's own generic loop (a
// pre-existing gap, not introduced by #70 -- see ADDING_A_CHECK_TYPE.md),
// but each check type's own isAttemptSuccessful is directly testable now.

Deno.test("isHttpAttemptSuccessful: no error, matching status -> true", () => {
  assertEquals(isHttpAttemptSuccessful(fakeResult({ http_status: 200 }), fakeProject()), true);
});

Deno.test("isHttpAttemptSuccessful: no error, wrong status -> false (triggers a retry)", () => {
  assertEquals(isHttpAttemptSuccessful(fakeResult({ http_status: 500 }), fakeProject()), false);
});

Deno.test("isHttpAttemptSuccessful: error set -> false, even if http_status happens to match", () => {
  assertEquals(
    isHttpAttemptSuccessful(
      fakeResult({ http_status: 200, error_message: "socket hang up" }),
      fakeProject(),
    ),
    false,
  );
});

Deno.test("isHttpAttemptSuccessful: matching status but bodyMatchFailed -> still true (assertions aren't retried)", () => {
  assertEquals(
    isHttpAttemptSuccessful(fakeResult({ http_status: 200, bodyMatchFailed: true }), fakeProject()),
    true,
  );
});
