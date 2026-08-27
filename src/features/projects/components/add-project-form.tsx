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
import { Switch } from "@/components/ui/switch";
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
import { notify } from "@/lib/toast";
import { IANA_TIMEZONES } from "../constants";
import { createProject, updateProject, updateProjectHeaders } from "../lib/actions";
import {
  createProjectFormDefaults,
  createProjectSchema,
  type CreateProjectFormValues,
} from "../lib/validation";
import type { Project } from "../types";
import type { HeaderMap } from "../lib/headers";
import {
  diffHeaderRows,
  getDuplicateHeaderKeys,
  headerRowsFromMasked,
  HeaderFieldsEditor,
  type HeaderRow,
} from "./header-fields-editor";

type FormState = Omit<
  CreateProjectFormValues,
  "tags" | "headers" | "keep_alive_window_start" | "keep_alive_window_end" | "keep_alive_timezone"
> & {
  tagsInput: string;
  // Kept as plain (possibly empty) strings here, not `string | null` like
  // CreateProjectFormValues -- <input type="time">/<input> need a string
  // `value` prop, and createProjectSchema's optionalTimeOfDay/optionalTimezone
  // already normalize "" to null at parse time (lib/validation.ts).
  keep_alive_window_start: string;
  keep_alive_window_end: string;
  keep_alive_timezone: string;
};

/** Postgres returns `time` columns as "HH:MM:SS" -- <input type="time">'s default (minute)
 * step only accepts "HH:MM", so the seconds are dropped here. */
function toTimeInputValue(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function toFormState(project?: Project): FormState {
  if (!project) {
    return {
      ...createProjectFormDefaults,
      tagsInput: "",
      keep_alive_window_start: "",
      keep_alive_window_end: "",
      keep_alive_timezone: "",
    };
  }
  return {
    name: project.name,
    description: project.description ?? "",
    health_url: project.health_url,
    method: (project.method as FormState["method"]) ?? "GET",
    body: project.body ?? "",
    expected_status: project.expected_status,
    check_interval_seconds: project.check_interval_seconds,
    timeout_ms: project.timeout_ms,
    hosting_provider: project.hosting_provider ?? "",
    collection: project.collection ?? "",
    check_type: (project.check_type as FormState["check_type"]) ?? "http",
    tagsInput: (project.tags ?? []).join(", "),
    keep_alive_enabled: project.keep_alive_enabled,
    keep_alive_window_start: toTimeInputValue(project.keep_alive_window_start),
    keep_alive_window_end: toTimeInputValue(project.keep_alive_window_end),
    keep_alive_timezone: project.keep_alive_timezone ?? "",
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
  /**
   * Collection names already used by the caller's other projects, offered as
   * autocomplete suggestions on the Collection field (via a native
   * <datalist>) so "Resume Projects" and "resume projects" don't end up as
   * two different collections by typo. Free text is still accepted -- there's
   * no dedicated collections table to validate against (see the
   * add_collection_to_projects_table migration for why).
   */
  existingCollections?: string[];
};

export function AddProjectForm({
  className,
  project,
  onSuccess,
  onCancel,
  existingCollections = [],
  ...props
}: AddProjectFormProps) {
  const isEditing = !!project;
  const [values, setValues] = useState<FormState>(() => toFormState(project));
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() =>
    headerRowsFromMasked((project?.headers as HeaderMap | null) ?? {}),
  );
  // Captured once on mount -- the set of header keys the project had when the
  // form opened, so submit can tell which keys were removed vs. left alone.
  const [originalHeaderKeys] = useState<string[]>(() =>
    Object.keys((project?.headers as HeaderMap | null) ?? {}),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (getDuplicateHeaderKeys(headerRows).size > 0) {
      setFormError("Header names must be unique (case-insensitive).");
      return;
    }

    const tags = values.tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    // Headers are only validated/submitted here for create. For edit, they
    // go through updateProjectHeaders below instead of this schema/action --
    // see lib/headers.ts for why masked values can't just round-trip here.
    // Also forced empty for check_type = "tcp" regardless of headerRows'
    // contents -- a raw TCP check has no HTTP headers to send, and the
    // editor for them is hidden for tcp (above), but headerRows itself
    // isn't cleared on a check_type switch, so this is the actual guard.
    const headersForCreate =
      isEditing || values.check_type === "tcp"
        ? {}
        : Object.fromEntries(
            headerRows
              .filter((row) => row.key.trim() && row.value.trim())
              .map((row) => [row.key.trim(), row.value]),
          );

    const result = createProjectSchema.safeParse({
      ...values,
      tags,
      headers: headersForCreate,
    });

    if (!result.success) {
      setFieldErrors(result.error.flatten().fieldErrors);
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (isEditing) {
        const {
          name,
          description,
          health_url,
          check_type,
          method,
          body,
          expected_status,
          check_interval_seconds,
          timeout_ms,
          hosting_provider,
          collection,
          tags: tagsList,
          keep_alive_enabled,
          keep_alive_window_start,
          keep_alive_window_end,
          keep_alive_timezone,
        } = result.data;

        const mainResult = await updateProject(project.id, {
          name,
          description,
          health_url,
          check_type,
          method,
          body,
          expected_status,
          check_interval_seconds,
          timeout_ms,
          hosting_provider,
          collection,
          tags: tagsList,
          keep_alive_enabled,
          keep_alive_window_start,
          keep_alive_window_end,
          keep_alive_timezone,
        });
        if (mainResult.error || !mainResult.data) {
          const message = mainResult.error ?? "Something went wrong.";
          setFormError(message);
          notify.error("Couldn't save project", message);
          return;
        }

        let finalProject = mainResult.data;
        const { set, remove } = diffHeaderRows(originalHeaderKeys, headerRows);
        if (Object.keys(set).length > 0 || remove.length > 0) {
          const headersResult = await updateProjectHeaders(project.id, {
            set,
            remove,
          });
          if (headersResult.error || !headersResult.data) {
            const message =
              headersResult.error ?? "Saved project details, but failed to save headers.";
            setFormError(message);
            notify.error("Couldn't save headers", message);
            return;
          }
          finalProject = headersResult.data;
        }

        notify.success("Project updated", `${finalProject.name} was saved.`);
        onSuccess?.(finalProject);
      } else {
        const response = await createProject(result.data);
        if (response.error || !response.data) {
          const message = response.error ?? "Something went wrong.";
          setFormError(message);
          notify.error("Couldn't create project", message);
          return;
        }
        setValues(toFormState());
        setHeaderRows([]);
        notify.success("Project created", `${response.data.name} is now being monitored.`);
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
        {!isEditing && !onCancel && (
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

        <Field orientation="responsive">
          <FieldLabel htmlFor="check_type">Check type</FieldLabel>
          <Select
            value={values.check_type}
            onValueChange={(value) =>
              updateField("check_type", value as FormState["check_type"])
            }
          >
            <SelectTrigger id="check_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="tcp">TCP port</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {values.check_type === "tcp" ? (
          <Field data-invalid={!!fieldErrors.health_url}>
            <FieldLabel htmlFor="health_url">Health check target</FieldLabel>
            <Input
              id="health_url"
              type="text"
              placeholder="db.example.com:5432"
              required
              aria-invalid={!!fieldErrors.health_url}
              value={values.health_url}
              onChange={(e) => updateField("health_url", e.target.value)}
            />
            <FieldDescription>
              Enter as &quot;host:port&quot;. Only whether a TCP connection
              can be opened is checked -- no request is sent.
            </FieldDescription>
            <FieldError errors={toFieldErrorMessages(fieldErrors.health_url)} />
          </Field>
        ) : (
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
        )}

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm text-muted-foreground">
              Advanced settings
            </AccordionTrigger>
            <AccordionContent>
              <FieldGroup>
                {values.check_type !== "tcp" && (
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
                )}

                {values.check_type !== "tcp" && values.method !== "GET" && (
                  <Field data-invalid={!!fieldErrors.body}>
                    <FieldLabel htmlFor="body">Request body</FieldLabel>
                    <Textarea
                      id="body"
                      placeholder='{"ping": true}'
                      rows={3}
                      aria-invalid={!!fieldErrors.body}
                      value={values.body}
                      onChange={(e) => updateField("body", e.target.value)}
                    />
                    <FieldDescription>
                      Sent with {values.method} requests. Set a Content-Type
                      header below if needed.
                    </FieldDescription>
                    <FieldError errors={toFieldErrorMessages(fieldErrors.body)} />
                  </Field>
                )}

                {values.check_type !== "tcp" && (
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
                )}

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

                <Field
                  orientation="responsive"
                  data-invalid={!!fieldErrors.collection}
                >
                  <FieldLabel htmlFor="collection">Collection</FieldLabel>
                  <Input
                    id="collection"
                    list="collection-suggestions"
                    placeholder="Resume Projects"
                    aria-invalid={!!fieldErrors.collection}
                    value={values.collection}
                    onChange={(e) => updateField("collection", e.target.value)}
                  />
                  {existingCollections.length > 0 && (
                    <datalist id="collection-suggestions">
                      {existingCollections.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  )}
                  <FieldError
                    errors={toFieldErrorMessages(fieldErrors.collection)}
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

                {values.check_type !== "tcp" && (
                  <HeaderFieldsEditor rows={headerRows} onChange={setHeaderRows} />
                )}

                <Field orientation="horizontal" className="w-auto gap-2">
                  <FieldLabel htmlFor="keep_alive_enabled">
                    Keep-alive pings
                  </FieldLabel>
                  <Switch
                    id="keep_alive_enabled"
                    checked={values.keep_alive_enabled}
                    onCheckedChange={(checked) =>
                      updateField("keep_alive_enabled", checked)
                    }
                  />
                </Field>
                <FieldDescription className="-mt-2">
                  Pings this project every 10 minutes to prevent free-tier
                  idling, independent of monitoring/alerting above.
                </FieldDescription>

                {values.keep_alive_enabled && (
                  <>
                    <Field
                      orientation="responsive"
                      data-invalid={!!fieldErrors.keep_alive_window_start}
                    >
                      <FieldLabel htmlFor="keep_alive_window_start">
                        Active window start
                      </FieldLabel>
                      <Input
                        id="keep_alive_window_start"
                        type="time"
                        aria-invalid={!!fieldErrors.keep_alive_window_start}
                        value={values.keep_alive_window_start}
                        onChange={(e) =>
                          updateField("keep_alive_window_start", e.target.value)
                        }
                      />
                      <FieldError
                        errors={toFieldErrorMessages(fieldErrors.keep_alive_window_start)}
                      />
                    </Field>

                    <Field
                      orientation="responsive"
                      data-invalid={!!fieldErrors.keep_alive_window_end}
                    >
                      <FieldLabel htmlFor="keep_alive_window_end">
                        Active window end
                      </FieldLabel>
                      <Input
                        id="keep_alive_window_end"
                        type="time"
                        aria-invalid={!!fieldErrors.keep_alive_window_end}
                        value={values.keep_alive_window_end}
                        onChange={(e) =>
                          updateField("keep_alive_window_end", e.target.value)
                        }
                      />
                      <FieldError
                        errors={toFieldErrorMessages(fieldErrors.keep_alive_window_end)}
                      />
                    </Field>

                    <Field
                      orientation="responsive"
                      data-invalid={!!fieldErrors.keep_alive_timezone}
                    >
                      <FieldLabel htmlFor="keep_alive_timezone">
                        Active window time zone
                      </FieldLabel>
                      <Input
                        id="keep_alive_timezone"
                        list="keep-alive-timezone-suggestions"
                        placeholder="America/New_York"
                        aria-invalid={!!fieldErrors.keep_alive_timezone}
                        value={values.keep_alive_timezone}
                        onChange={(e) =>
                          updateField("keep_alive_timezone", e.target.value)
                        }
                      />
                      <datalist id="keep-alive-timezone-suggestions">
                        {IANA_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz} />
                        ))}
                      </datalist>
                      <FieldDescription>
                        Leave all three active-window fields blank to ping
                        continuously instead of only during set hours.
                      </FieldDescription>
                      <FieldError
                        errors={toFieldErrorMessages(fieldErrors.keep_alive_timezone)}
                      />
                    </Field>
                  </>
                )}
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

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
