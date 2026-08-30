"use client";

import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { notify } from "@/lib/toast";
import {
  MAX_BULK_IMPORT_ROWS,
  parseImportFile,
  type BulkImportEntry,
} from "../lib/bulk-import";
import { createProject } from "../lib/actions";
import { createProjectSchema } from "../lib/validation";
import type { Project } from "../types";

type RowResult = {
  row: number;
  name?: string;
  status: "created" | "error";
  error?: string;
};

/**
 * Inline CSV/JSON import, collapsed into the "Add project" sheet above the
 * single-project form (separated by a `<Separator />`) rather than living on
 * its own dedicated page -- one entry point for adding projects, whether
 * that's one at a time or in bulk. Replaces the old standalone
 * `/dashboard/projects/import` route and `BulkImportForm`.
 *
 * Rows are created one at a time via `createProject` directly (not the
 * batched `bulkCreateProjects` server action) so the progress bar reflects
 * real per-row completion instead of one opaque "importing..." spinner for
 * the whole file -- each row is already an independent DB round trip either
 * way (see `bulk-actions.ts`'s own comment on why), this just moves that
 * loop to the client so the UI can observe it.
 */
export function ImportSection({
  onComplete,
}: {
  /** Fired once, after every row has been attempted, with every project that
   * was actually created (so the caller can merge them into local state or
   * fall back to `router.refresh()`). */
  onComplete: (created: Project[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<BulkImportEntry[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<RowResult[] | null>(null);

  function reset() {
    setEntries(null);
    setFileName(null);
    setParseErrors([]);
    setResults(null);
    setProgress({ completed: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults(null);
    setFileName(file.name);

    const text = await file.text();
    const { entries: parsedEntries, parseErrors: errors } = parseImportFile(file.name, text);

    if (errors.length > 0) {
      setEntries(null);
      setParseErrors(errors);
      notify.error("Couldn't read file", errors[0]);
      return;
    }
    if (parsedEntries.length === 0) {
      setEntries(null);
      const message = "No project rows found in this file.";
      setParseErrors([message]);
      notify.error("Couldn't read file", message);
      return;
    }
    if (parsedEntries.length > MAX_BULK_IMPORT_ROWS) {
      setEntries(null);
      const message = `File has ${parsedEntries.length} rows. Import at most ${MAX_BULK_IMPORT_ROWS} at a time.`;
      setParseErrors([message]);
      notify.error("Too many rows", message);
      return;
    }

    setParseErrors([]);
    setEntries(parsedEntries);
  }

  async function handleImport() {
    if (!entries) return;
    setIsImporting(true);
    setResults(null);
    setProgress({ completed: 0, total: entries.length });

    const rowResults: RowResult[] = [];
    const created: Project[] = [];

    for (let index = 0; index < entries.length; index++) {
      const row = index + 1;
      const entry = entries[index];
      const entryName = typeof entry.name === "string" ? entry.name : undefined;

      const parsed = createProjectSchema.safeParse(entry);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        rowResults.push({
          row,
          name: entryName,
          status: "error",
          error: firstIssue
            ? `${firstIssue.path.join(".") || "value"}: ${firstIssue.message}`
            : "Invalid entry.",
        });
      } else {
        const { data, error } = await createProject(parsed.data);
        if (error || !data) {
          rowResults.push({ row, name: entryName, status: "error", error: error ?? "Something went wrong." });
        } else {
          created.push(data);
          rowResults.push({ row, name: data.name, status: "created" });
        }
      }

      setProgress({ completed: row, total: entries.length });
    }

    setResults(rowResults);
    setIsImporting(false);
    onComplete(created);

    const errorCount = rowResults.filter((r) => r.status === "error").length;
    if (created.length > 0 && errorCount === 0) {
      notify.success(`Imported ${created.length} project${created.length === 1 ? "" : "s"}`);
    } else if (created.length > 0 && errorCount > 0) {
      notify.warning(
        `Imported ${created.length} of ${rowResults.length} projects`,
        `${errorCount} row${errorCount === 1 ? "" : "s"} failed -- see details below.`,
      );
    } else {
      notify.error("Import failed", `All ${rowResults.length} rows failed to import.`);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <UploadCloud className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Import from a file</span>
            <span className="text-xs text-muted-foreground">
              Upload a <code>.csv</code> or <code>.json</code> file to add multiple projects at once.
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isImporting}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="size-4" />
          Choose file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {parseErrors.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-destructive">
          {parseErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      )}

      {entries && !results && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              {entries.length} project{entries.length === 1 ? "" : "s"} found in{" "}
              <span className="font-medium">{fileName}</span>
            </span>
            <Button type="button" size="sm" disabled={isImporting} onClick={handleImport}>
              {isImporting
                ? `Importing ${progress.completed}/${progress.total}...`
                : `Import ${entries.length}`}
            </Button>
          </div>
          {isImporting && (
            <Progress value={(progress.completed / Math.max(progress.total, 1)) * 100} />
          )}
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="default">
              {results.filter((r) => r.status === "created").length} created
            </Badge>
            {results.some((r) => r.status === "error") && (
              <Badge variant="destructive">
                {results.filter((r) => r.status === "error").length} failed
              </Badge>
            )}
          </div>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
            {results.map((result) => (
              <div
                key={result.row}
                className="flex items-start gap-2 rounded-md border p-2 text-sm"
              >
                {result.status === "created" && (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                )}
                {result.status === "error" && (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium">
                    Row {result.row}
                    {result.name ? ` -- ${result.name}` : ""}
                  </span>
                  {result.error && <span className="text-destructive">{result.error}</span>}
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reset} className="self-start">
            Import another file
          </Button>
        </div>
      )}
    </div>
  );
}
