import Papa from "papaparse";

export type BulkImportEntry = Record<string, unknown>;

export type BulkImportParseResult = {
  entries: BulkImportEntry[];
  /** File-level or row-level parse failures (bad syntax) -- distinct from
   * per-entry schema validation errors, which happen later server-side. */
  parseErrors: string[];
};

/** A safety cap on rows-per-import: each row is a sequential DB round trip
 * inside one server action call, so an unbounded file could run long enough
 * to hit a serverless function timeout. */
export const MAX_BULK_IMPORT_ROWS = 200;

const NUMERIC_FIELDS = [
  "expected_status",
  "check_interval_seconds",
  "timeout_ms",
] as const;

/**
 * Normalizes a raw parsed row (CSV values are always strings; JSON values
 * keep their native types) into the shape createProjectSchema expects.
 * Bulk import deliberately does not support `headers` (custom headers /
 * bearer tokens) -- see lib/headers.ts -- so any `headers` key present in
 * the uploaded file is stripped rather than accepted.
 */
export function normalizeBulkImportEntry(raw: BulkImportEntry): BulkImportEntry {
  const entry: BulkImportEntry = { ...raw };

  for (const field of NUMERIC_FIELDS) {
    const value = entry[field];
    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        entry[field] = num;
      }
    }
  }

  // CSV cells can't contain commas cleanly (that's the CSV delimiter), so
  // tags are semicolon-separated in CSV; JSON can use a native array.
  if (typeof entry.tags === "string") {
    entry.tags = entry.tags
      .split(";")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  delete entry.headers;

  return entry;
}

export function parseJsonImport(text: string): BulkImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { entries: [], parseErrors: ["File is not valid JSON."] };
  }

  if (!Array.isArray(parsed)) {
    return {
      entries: [],
      parseErrors: ["JSON file must contain an array of project objects."],
    };
  }

  return {
    entries: parsed.map((entry) =>
      normalizeBulkImportEntry(entry as BulkImportEntry),
    ),
    parseErrors: [],
  };
}

export function parseCsvImport(text: string): BulkImportParseResult {
  const result = Papa.parse<BulkImportEntry>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const parseErrors = result.errors.map(
    (error) =>
      `Row ${error.row != null ? error.row + 1 : "?"}: ${error.message}`,
  );

  return {
    entries: result.data.map(normalizeBulkImportEntry),
    parseErrors,
  };
}

/** Dispatches to the right parser based on file extension. */
export function parseImportFile(
  fileName: string,
  text: string,
): BulkImportParseResult {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsvImport(text);
  }
  if (fileName.toLowerCase().endsWith(".json")) {
    return parseJsonImport(text);
  }
  return { entries: [], parseErrors: ["File must be .json or .csv."] };
}
