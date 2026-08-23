"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import {
  MAX_BULK_IMPORT_ROWS,
  parseImportFile,
  type BulkImportEntry,
} from "../lib/bulk-import";
import { bulkCreateProjects, type BulkImportRowResult } from "../lib/bulk-actions";

export function BulkImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [entries, setEntries] = useState<BulkImportEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<BulkImportRowResult[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults(null);
    setFileName(file.name);

    const text = await file.text();
    const { entries: parsedEntries, parseErrors: errors } = parseImportFile(
      file.name,
      text,
    );

    if (errors.length === 0 && parsedEntries.length === 0) {
      setEntries([]);
      setParseErrors(["No project rows found in this file."]);
      return;
    }

    if (parsedEntries.length > MAX_BULK_IMPORT_ROWS) {
      setEntries([]);
      setParseErrors([
        `File has ${parsedEntries.length} rows. Import at most ${MAX_BULK_IMPORT_ROWS} at a time.`,
      ]);
      return;
    }

    setEntries(parsedEntries);
    setParseErrors(errors);
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const rowResults = await bulkCreateProjects(entries);
      setResults(rowResults);
    } finally {
      setIsImporting(false);
    }
  }

  function reset() {
    setFileName(null);
    setEntries([]);
    setParseErrors([]);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const createdCount = results?.filter((r) => r.status === "created").length ?? 0;
  const warningCount = results?.filter((r) => r.warning).length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Bulk import projects</h1>
        <FieldDescription>
          Upload a <code>.json</code> array of project objects or a{" "}
          <code>.csv</code> file with matching column headers:{" "}
          <code>name, health_url</code> required;{" "}
          <code>
            description, method, expected_status, check_interval_seconds,
            timeout_ms, hosting_provider, collection, tags
          </code>{" "}
          optional. In CSV, separate multiple <code>tags</code> with{" "}
          <code>;</code> (not <code>,</code>). Custom headers / bearer tokens
          aren&apos;t supported via import -- add those individually after
          creating a project.
        </FieldDescription>
      </div>

      {!results && (
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileChange}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />

          {parseErrors.length > 0 && (
            <div className="flex flex-col gap-1 text-sm text-destructive">
              {parseErrors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </div>
          )}

          {entries.length > 0 && parseErrors.length === 0 && (
            <Card variant="soft">
              <CardHeader>
                <CardTitle className="text-base">
                  {entries.length} project{entries.length === 1 ? "" : "s"}{" "}
                  found in {fileName}
                </CardTitle>
                <CardDescription>
                  Each row is validated independently on import -- rows with
                  errors won&apos;t block the rest from being created.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleImport} disabled={isImporting}>
                  <UploadCloud className="size-4" />
                  {isImporting ? "Importing..." : `Import ${entries.length}`}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="default">{createdCount} created</Badge>
            {warningCount > 0 && (
              <Badge variant="outline">{warningCount} duplicate</Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} failed</Badge>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {results.map((result) => (
              <div
                key={result.row}
                className="flex items-start gap-2 rounded-md border p-3 text-sm"
              >
                {result.status === "created" && !result.warning && (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                )}
                {result.status === "created" && result.warning && (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                )}
                {result.status === "error" && (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium">
                    Row {result.row}
                    {result.name ? ` -- ${result.name}` : ""}
                  </span>
                  {result.status === "error" && (
                    <span className="text-destructive">{result.error}</span>
                  )}
                  {result.warning && (
                    <span className="text-muted-foreground">
                      {result.warning}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={reset} className="self-start">
            Import another file
          </Button>
        </div>
      )}
    </div>
  );
}
