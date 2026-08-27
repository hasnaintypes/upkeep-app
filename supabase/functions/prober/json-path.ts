// JSON path/value assertion evaluation (PRD §5.2, Phase 9, issue #59) --
// a stricter sibling of #58's plain keyword/content match: instead of "body
// contains this substring", "the value at this JSON path in the parsed
// body equals this expected value" (e.g. `$.status` must equal "ok").
//
// Split into its own module (rather than inlined in check.ts, unlike #58's
// much simpler `bodyText.includes(...)` one-liner) for the same reason
// tls-cert.ts is its own module: parsing a path syntax and walking a
// parsed JSON value is enough independent logic to deserve its own unit
// tests (json-path.test.ts) without cluttering check.ts's runHttpCheck.
//
// Deliberately a minimal hand-rolled dot/bracket-path walker, not a full
// JSONPath (RFC 9535) implementation -- no wildcards, filters, slices, or
// recursive descent. Supports exactly what #59's own acceptance criteria
// need: a fixed path into a specific scalar (e.g. `$.status`,
// `$.data.items[0].code`). Matches this codebase's established "boring,
// extensible" precedent for Phase 9 check types (see check.ts's own
// comments on #56/#57 scoping): a real project that needs wildcards/
// filters can be the reason to reach for a proper JSONPath library later,
// not a speculative build-out now.

/** Parses a path like `$.data.items[0].status` into an ordered list of
 * property-name/array-index segments (`["data", "items", "0", "status"]`),
 * or `null` if the syntax doesn't match "$" followed by zero or more
 * `.identifier` / `[index]` segments with no gaps. Exported for direct
 * unit testing. */
export function parseJsonPathSegments(path: string): string[] | null {
  if (!path.startsWith("$")) {
    return null;
  }

  const rest = path.slice(1);
  if (rest === "") {
    // Bare "$" -- the whole body is the value under assertion.
    return [];
  }

  const segments: string[] = [];
  const segmentPattern = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = segmentPattern.exec(rest)) !== null) {
    // A gap between the previous match and this one means characters in
    // `rest` didn't belong to any recognized segment (e.g. "$.foo bar",
    // "$.foo..bar", "$foo" without the leading dot) -- reject the whole
    // path rather than silently skipping the unparseable part.
    if (match.index !== lastIndex) {
      return null;
    }
    segments.push(match[1] !== undefined ? match[1] : match[2]);
    lastIndex = segmentPattern.lastIndex;
  }

  if (lastIndex !== rest.length) {
    return null;
  }

  return segments;
}

export type JsonPathResolution =
  | { found: true; value: unknown }
  | { found: false; invalidSyntax: boolean };

/** Walks `value` (already-parsed JSON) along `path`'s segments. Returns
 * `found: false` both when the path syntax itself is invalid and when a
 * syntactically valid path simply doesn't resolve (missing property,
 * out-of-bounds/non-array index, or indexing into a scalar) -- the two are
 * distinguished via `invalidSyntax` so callers can produce a more specific
 * error message. Exported for direct unit testing. */
export function resolveJsonPath(value: unknown, path: string): JsonPathResolution {
  const segments = parseJsonPathSegments(path);
  if (segments === null) {
    return { found: false, invalidSyntax: true };
  }

  let current: unknown = value;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return { found: false, invalidSyntax: false };
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, invalidSyntax: false };
      }
      current = current[index];
    } else {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, segment)) {
        return { found: false, invalidSyntax: false };
      }
      current = record[segment];
    }
  }

  return { found: true, value: current };
}

export type JsonAssertionOutcome = { failed: false } | { failed: true; message: string };

/**
 * Parses `bodyText` as JSON, resolves `path` against it, and compares the
 * resolved value's `String()` representation to `expectedValue` -- a
 * matching HTTP status with a body that either isn't valid JSON, doesn't
 * contain the path, or has a different value at that path all produce a
 * `failed: true` outcome with a distinct, specific `message` (#59's own
 * acceptance criterion: "the mismatch/parse error captured in
 * error_message").
 *
 * Comparison is deliberately string-based, not deep-equal -- matches
 * `expected_json_value`'s plain-text column type (same convention as #58's
 * `expected_body_match`) and covers every JSON scalar (string/number/
 * boolean/null) via `String()`. A path resolving to an object or array is
 * treated as a failure rather than attempting a structural comparison --
 * out of scope for a "boring, extensible" v1 (see this module's own top
 * comment); revisit if a real project needs to assert on a whole
 * sub-object.
 */
export function evaluateJsonAssertion(
  bodyText: string,
  path: string,
  expectedValue: string,
): JsonAssertionOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (err) {
    const parseErrorMessage = err instanceof Error ? err.message : "invalid JSON";
    return {
      failed: true,
      message: `Response body is not valid JSON (${parseErrorMessage}).`,
    };
  }

  const resolved = resolveJsonPath(parsed, path);
  if (!resolved.found) {
    return resolved.invalidSyntax
      ? { failed: true, message: `Invalid JSON path syntax: "${path}".` }
      : { failed: true, message: `JSON path "${path}" not found in response body.` };
  }

  if (resolved.value !== null && typeof resolved.value === "object") {
    return {
      failed: true,
      message: `JSON path "${path}" resolved to a non-scalar value; expected "${expectedValue}".`,
    };
  }

  const actual = resolved.value === null ? "null" : String(resolved.value);
  if (actual !== expectedValue) {
    return {
      failed: true,
      message: `JSON path "${path}" expected "${expectedValue}", got "${actual}".`,
    };
  }

  return { failed: false };
}
