/**
 * Custom header / bearer token masking for `projects.headers` (PRD §5.1,
 * §8's "shared-secret header" requirement). Every server response that could
 * contain this column MUST route through `maskProjectHeaders` before being
 * returned to the client -- see actions.ts / queries.ts, which all apply it
 * unconditionally, not just on the "obvious" read paths. This is the one
 * function that's allowed to see raw header values; nothing else should.
 */

export type HeaderMap = Record<string, string>;

function isHeaderMap(value: unknown): value is HeaderMap {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

/** Shows only the last 4 characters of a header value, e.g. "••••1234". */
export function maskHeaderValue(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

/** Masks every value in a `headers` jsonb column value. Non-string-map input (null, malformed) becomes `{}`. */
export function maskHeaders(headers: unknown): HeaderMap {
  if (!isHeaderMap(headers)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, maskHeaderValue(value)]),
  );
}

/** Returns a shallow copy of a project row with `headers` masked. */
export function maskProjectHeaders<T extends { headers: unknown }>(
  project: T,
): T {
  return { ...project, headers: maskHeaders(project.headers) };
}

/**
 * Applies `set` (new/changed values) then `remove` (deleted keys) on top of
 * the current *raw* headers, for use only on the server inside
 * updateProjectHeaders -- never call this with masked values, or the masked
 * placeholder strings will overwrite the real stored secrets.
 */
export function mergeHeaders(
  current: unknown,
  set: HeaderMap,
  remove: string[],
): HeaderMap {
  const merged: HeaderMap = { ...(isHeaderMap(current) ? current : {}), ...set };
  for (const key of remove) {
    delete merged[key];
  }
  return merged;
}
