"use client";

import { useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { createApiKey } from "../lib/actions";
import { apiKeyLabelSchema } from "../lib/validation";
import type { ApiKey, CreatedApiKey } from "../types";

/**
 * Generates a new API key (#47). A two-step dialog rather than two separate
 * dialogs: step one collects a label, step two (after `createApiKey`
 * succeeds) reveals the plaintext key exactly once -- there is no
 * mechanism anywhere in this feature to view it again after this dialog
 * closes (see types/index.ts's `CreatedApiKey` doc comment), so closing
 * without copying it means generating a new key instead.
 */
export function GenerateApiKeyDialog({
  onCreated,
}: {
  onCreated: (key: ApiKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setLabel("");
    setFieldError(null);
    setFormError(null);
    setCreatedKey(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldError(null);

    const result = apiKeyLabelSchema.safeParse(label);
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Invalid label.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createApiKey(result.data);
      if (response.error || !response.data) {
        const message = response.error ?? "Something went wrong.";
        setFormError(message);
        notify.error("Couldn't generate key", message);
        return;
      }
      setCreatedKey(response.data);
      onCreated(response.data);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.plaintextKey);
    setCopied(true);
    notify.success("Copied to clipboard");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Generate key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new API key</DialogTitle>
              <DialogDescription>
                This is the only time you&apos;ll see the full key. Store it somewhere safe --
                you&apos;ll need to generate a new one if you lose it.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={createdKey.plaintextKey} className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy key"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate API key</DialogTitle>
              <DialogDescription>
                Used to authenticate programmatic requests, e.g. `POST /api/projects/register`
                from a deploy step.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field data-invalid={!!fieldError}>
                  <FieldLabel htmlFor="api-key-label">Label</FieldLabel>
                  <Input
                    id="api-key-label"
                    placeholder="e.g. CI deploy step"
                    required
                    aria-invalid={!!fieldError}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <FieldDescription>
                    Helps you tell keys apart later -- not shown to anyone else.
                  </FieldDescription>
                  <FieldError errors={fieldError ? [{ message: fieldError }] : undefined} />
                </Field>

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                <Field orientation="horizontal" className="justify-end">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-none">
                    {isSubmitting ? "Generating..." : "Generate key"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
