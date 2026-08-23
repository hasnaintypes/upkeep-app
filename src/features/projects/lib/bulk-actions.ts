"use server";

import { createClient } from "@/lib/supabase/server";
import { createProjectSchema } from "./validation";
import { maskProjectHeaders } from "./headers";
import { MAX_BULK_IMPORT_ROWS, type BulkImportEntry } from "./bulk-import";
import type { Project } from "../types";

export type BulkImportRowResult = {
  /** 1-based row number in the uploaded file, for user-facing messages. */
  row: number;
  name?: string;
  status: "created" | "error";
  project?: Project;
  error?: string;
  /** Set when status is "created" but the health_url duplicates an existing
   * or earlier-in-this-batch project -- surfaced, not silently overwritten
   * (there's no upsert here; it's always a genuinely new row). */
  warning?: string;
};

/**
 * Creates one project per entry, independently. Each row is validated
 * against the same createProjectSchema the single "Add project" form uses,
 * and a failure on one row doesn't affect the others -- this is a sequence
 * of independent inserts, not a single transaction, specifically so partial
 * success can be reported per the acceptance criteria.
 *
 * `headers` (custom headers / bearer tokens) is intentionally unsupported --
 * see lib/bulk-import.ts's normalizeBulkImportEntry, which strips it before
 * this ever runs.
 */
export async function bulkCreateProjects(
  entries: BulkImportEntry[],
): Promise<BulkImportRowResult[]> {
  if (entries.length === 0) {
    return [];
  }
  if (entries.length > MAX_BULK_IMPORT_ROWS) {
    return [
      {
        row: 0,
        status: "error",
        error: `Too many rows (${entries.length}). Import at most ${MAX_BULK_IMPORT_ROWS} projects at a time.`,
      },
    ];
  }

  const supabase = await createClient();

  // Existing health_urls for this user (RLS-scoped), to detect duplicates
  // against already-registered projects, not just duplicates within the
  // uploaded file itself.
  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("name, health_url");

  if (existingError) {
    return entries.map((_, index) => ({
      row: index + 1,
      status: "error" as const,
      error: `Could not check for duplicate health URLs: ${existingError.message}`,
    }));
  }

  const seenHealthUrls = new Map<string, string>();
  for (const project of existing ?? []) {
    seenHealthUrls.set(project.health_url, project.name);
  }

  const results: BulkImportRowResult[] = [];

  for (let index = 0; index < entries.length; index++) {
    const row = index + 1;
    const entryName =
      typeof entries[index]?.name === "string"
        ? (entries[index].name as string)
        : undefined;

    const parsed = createProjectSchema.safeParse(entries[index]);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      results.push({
        row,
        name: entryName,
        status: "error",
        error: firstIssue
          ? `${firstIssue.path.join(".") || "value"}: ${firstIssue.message}`
          : "Invalid entry.",
      });
      continue;
    }

    const {
      name,
      description,
      health_url,
      method,
      expected_status,
      check_interval_seconds,
      timeout_ms,
      hosting_provider,
      collection,
      tags,
    } = parsed.data;

    const duplicateOf = seenHealthUrls.get(health_url);

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        description,
        health_url,
        method,
        expected_status,
        check_interval_seconds,
        timeout_ms,
        hosting_provider,
        collection,
        tags,
      })
      .select()
      .single();

    if (error) {
      results.push({ row, name, status: "error", error: error.message });
      continue;
    }

    seenHealthUrls.set(health_url, name);

    results.push({
      row,
      name,
      status: "created",
      project: maskProjectHeaders(data),
      warning: duplicateOf
        ? `Duplicate health_url -- also used by "${duplicateOf}".`
        : undefined,
    });
  }

  return results;
}
