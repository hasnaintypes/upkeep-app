"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { createProject, updateProject } from "../lib/actions";
import {
  createProjectFormDefaults,
  createProjectSchema,
  type CreateProjectFormValues,
} from "../lib/validation";
import type { Project } from "../types";

type FormState = Omit<CreateProjectFormValues, "tags"> & { tagsInput: string };

function toFormState(project?: Project): FormState {
  if (!project) {
    return { ...createProjectFormDefaults, tagsInput: "" };
  }
  return {
    name: project.name,
    description: project.description ?? "",
    health_url: project.health_url,
    method: (project.method as FormState["method"]) ?? "GET",
    expected_status: project.expected_status,
    check_interval_seconds: project.check_interval_seconds,
    timeout_ms: project.timeout_ms,
    hosting_provider: project.hosting_provider ?? "",
    tagsInput: (project.tags ?? []).join(", "),
  };
}

type FieldErrors = Partial<Record<keyof CreateProjectFormValues, string[]>>;

function toFieldErrorMessages(messages: string[] | undefined) {
  return messages?.map((message) => ({ message }));
}

type AddProjectFormProps = React.ComponentPropsWithoutRef<"form"> & {
  /** When provided, the form edits this project instead of creating a new one. */
  project?: Project;
  /** Called with the created/updated row after a successful submit. */
  onSuccess?: (project: Project) => void;
  /** Renders a Cancel button next to Submit (e.g. when used inside a dialog). */
  onCancel?: () => void;
};

export function AddProjectForm({
  className,
  project,
  onSuccess,
  onCancel,
  ...props
}: AddProjectFormProps) {
  const isEditing = !!project;
  const [values, setValues] = useState<FormState>(() => toFormState(project));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);

    const tags = values.tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const result = createProjectSchema.safeParse({ ...values, tags });

    if (!result.success) {
      setFieldErrors(result.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = isEditing
        ? await updateProject(project.id, result.data)
        : await createProject(result.data);

      if (response.error || !response.data) {
        setFormError(response.error ?? "Something went wrong.");
        return;
      }

      if (isEditing) {
        onSuccess?.(response.data);
      } else {
        setSuccess(true);
        setValues(toFormState());
        onSuccess?.(response.data);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        {!isEditing && (
          <div>
            <h1 className="text-xl font-bold">Add project</h1>
            <FieldDescription>
              Register a project&apos;s health endpoint to start monitoring it.
            </FieldDescription>
          </div>
        )}

        <Field data-invalid={!!fieldErrors.name}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            placeholder="Portfolio Site"
            required
            aria-invalid={!!fieldErrors.name}
            value={values.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
          <FieldError errors={toFieldErrorMessages(fieldErrors.name)} />
        </Field>

        <Field data-invalid={!!fieldErrors.description}>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            placeholder="What is this project?"
            rows={3}
            aria-invalid={!!fieldErrors.description}
            value={values.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
          <FieldError errors={toFieldErrorMessages(fieldErrors.description)} />
        </Field>

        <Field data-invalid={!!fieldErrors.health_url}>
          <FieldLabel htmlFor="health_url">Health check URL</FieldLabel>
          <Input
            id="health_url"
            type="url"
            placeholder="https://your-app.example.com/health"
            required
            aria-invalid={!!fieldErrors.health_url}
            value={values.health_url}
            onChange={(e) => updateField("health_url", e.target.value)}
          />
          <FieldDescription>
            Must use https://
            {process.env.NODE_ENV !== "production" &&
              ", or http://localhost while developing"}
            .
          </FieldDescription>
          <FieldError errors={toFieldErrorMessages(fieldErrors.health_url)} />
        </Field>

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm text-muted-foreground">
              Advanced settings
            </AccordionTrigger>
            <AccordionContent>
              <FieldGroup>
                <Field orientation="responsive">
                  <FieldLabel htmlFor="method">Method</FieldLabel>
                  <Select
                    value={values.method}
                    onValueChange={(value) =>
                      updateField("method", value as FormState["method"])
                    }
                  >
                    <SelectTrigger id="method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="HEAD">HEAD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  orientation="responsive"
                  data-invalid={!!fieldErrors.expected_status}
                >
                  <FieldLabel htmlFor="expected_status">
                    Expected status
                  </FieldLabel>
                  <Input
                    id="expected_status"
                    type="number"
                    aria-invalid={!!fieldErrors.expected_status}
                    value={values.expected_status}
                    onChange={(e) =>
                      updateField("expected_status", Number(e.target.value))
                    }
                  />
                  <FieldError
                    errors={toFieldErrorMessages(fieldErrors.expected_status)}
                  />
                </Field>

                <Field
                  orientation="responsive"
                  data-invalid={!!fieldErrors.check_interval_seconds}
                >
                  <FieldLabel htmlFor="check_interval_seconds">
                    Check interval (seconds)
                  </FieldLabel>
                  <Input
                    id="check_interval_seconds"
                    type="number"
                    aria-invalid={!!fieldErrors.check_interval_seconds}
                    value={values.check_interval_seconds}
                    onChange={(e) =>
                      updateField(
                        "check_interval_seconds",
                        Number(e.target.value),
                      )
                    }
                  />
                  <FieldError
                    errors={toFieldErrorMessages(
                      fieldErrors.check_interval_seconds,
                    )}
                  />
                </Field>

                <Field
                  orientation="responsive"
                  data-invalid={!!fieldErrors.timeout_ms}
                >
                  <FieldLabel htmlFor="timeout_ms">Timeout (ms)</FieldLabel>
                  <Input
                    id="timeout_ms"
                    type="number"
                    aria-invalid={!!fieldErrors.timeout_ms}
                    value={values.timeout_ms}
                    onChange={(e) =>
                      updateField("timeout_ms", Number(e.target.value))
                    }
                  />
                  <FieldError
                    errors={toFieldErrorMessages(fieldErrors.timeout_ms)}
                  />
                </Field>

                <Field orientation="responsive">
                  <FieldLabel htmlFor="hosting_provider">
                    Hosting provider
                  </FieldLabel>
                  <Input
                    id="hosting_provider"
                    placeholder="Render, Railway, Vercel..."
                    value={values.hosting_provider}
                    onChange={(e) =>
                      updateField("hosting_provider", e.target.value)
                    }
                  />
                </Field>

                <Field data-invalid={!!fieldErrors.tags}>
                  <FieldLabel htmlFor="tags">Tags</FieldLabel>
                  <Input
                    id="tags"
                    placeholder="frontend, portfolio"
                    aria-invalid={!!fieldErrors.tags}
                    value={values.tagsInput}
                    onChange={(e) => updateField("tagsInput", e.target.value)}
                  />
                  <FieldDescription>Comma-separated.</FieldDescription>
                  <FieldError errors={toFieldErrorMessages(fieldErrors.tags)} />
                </Field>
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {success && (
          <p className="text-sm text-emerald-600 dark:text-emerald-500">
            Project created.
          </p>
        )}

        <Field
          orientation={onCancel ? "horizontal" : "vertical"}
          className={onCancel ? "justify-end" : undefined}
        >
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} className={onCancel ? "flex-none" : undefined}>
            {isSubmitting
              ? isEditing
                ? "Saving..."
                : "Adding project..."
              : isEditing
                ? "Save changes"
                : "Add project"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
