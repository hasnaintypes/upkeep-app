"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import type { HeaderMap } from "../lib/headers";

export type HeaderRow = {
  /** Stable client-side id for React list rendering -- not persisted. */
  id: string;
  key: string;
  /**
   * The real value while `masked` is false (new/edited rows), or a
   * display-only masked string like "••••1234" while `masked` is true
   * (existing rows loaded from an already-saved project). Masked values are
   * never editable in place -- "Change" clears them to force fresh input,
   * so a masked placeholder can never accidentally get saved as if it were
   * a real value.
   */
  value: string;
  masked: boolean;
};

function newRow(key = "", value = ""): HeaderRow {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    key,
    value,
    masked: false,
  };
}

/** Builds masked `HeaderRow`s from an already-masked headers map (e.g. from `project.headers`). */
export function headerRowsFromMasked(headers: HeaderMap): HeaderRow[] {
  return Object.entries(headers).map(([key, value]) => ({
    id: newRow().id,
    key,
    value,
    masked: true,
  }));
}

/**
 * Diffs the editor's current rows against the keys that were originally
 * loaded (masked) to produce the `{ set, remove }` payload for
 * updateProjectHeaders. Only unmasked rows with both a key and a value
 * contribute to `set` -- untouched masked rows are never sent anywhere, so a
 * saved secret's real value never has to leave the server to stay unchanged.
 */
export function diffHeaderRows(
  originalKeys: string[],
  rows: HeaderRow[],
): { set: HeaderMap; remove: string[] } {
  const set: HeaderMap = {};
  const currentKeys = new Set<string>();

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    currentKeys.add(key);
    if (!row.masked && row.value.trim()) {
      set[key] = row.value;
    }
  }

  const remove = originalKeys.filter((key) => !currentKeys.has(key));
  return { set, remove };
}

type HeaderFieldsEditorProps = {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
};

/**
 * Key/value editor for a project's custom headers / bearer token
 * (PRD §5.1, §8). Existing values arrive pre-masked from the server (see
 * lib/headers.ts) and can only be replaced, never revealed -- there is no
 * code path in this component that can display a previously-saved secret in
 * full.
 */
export function HeaderFieldsEditor({ rows, onChange }: HeaderFieldsEditorProps) {
  function updateRow(id: string, patch: Partial<HeaderRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    onChange(rows.filter((row) => row.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <FieldLabel>Custom headers</FieldLabel>
        <FieldDescription>
          Sent with every health check request (e.g. a bearer token so the
          endpoint isn&apos;t publicly guessable). Saved values are masked
          here after saving and can only be replaced, not viewed again.
        </FieldDescription>
      </div>

      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            placeholder="Header name"
            aria-label="Header name"
            className="w-1/3"
            value={row.key}
            disabled={row.masked}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
          />
          {row.masked ? (
            <>
              <Input
                aria-label="Header value (saved)"
                className="flex-1"
                value={row.value}
                disabled
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateRow(row.id, { masked: false, value: "" })}
              >
                Change
              </Button>
            </>
          ) : (
            <Input
              placeholder="Header value"
              aria-label="Header value"
              className="flex-1"
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove header"
            onClick={() => removeRow(row.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, newRow()])}
        >
          <Plus className="size-4" /> Add header
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, newRow("Authorization", "Bearer ")])}
        >
          <KeyRound className="size-4" /> Add bearer token
        </Button>
      </div>
    </div>
  );
}
