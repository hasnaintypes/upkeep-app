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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createNotificationChannel, updateNotificationChannel } from "../lib/actions";
import { createChannelSchema } from "../lib/validation";
import { NOTIFICATION_CHANNEL_TYPES } from "../constants";
import type { NotificationChannel, NotificationChannelType } from "../types";

/** The single config field each channel type needs -- one text input per
 * type, matching each dispatcher's own `config` shape (see
 * lib/validation.ts's doc comment). */
const CONFIG_FIELD: Record<
  NotificationChannelType,
  { key: string; label: string; placeholder: string; inputType: string }
> = {
  discord: {
    key: "webhook_url",
    label: "Webhook URL",
    placeholder: "https://discord.com/api/webhooks/...",
    inputType: "url",
  },
  email: {
    key: "to",
    label: "Email address",
    placeholder: "you@example.com",
    inputType: "email",
  },
  webhook: {
    key: "url",
    label: "Webhook URL",
    placeholder: "https://your-endpoint.example.com/hooks/upkeep",
    inputType: "url",
  },
};

type AddChannelFormProps = React.ComponentPropsWithoutRef<"form"> & {
  /** When provided, the form replaces this channel's config instead of
   * creating a new one. Its `type` is fixed -- see
   * updateNotificationChannel's doc comment for why type isn't editable. */
  channel?: NotificationChannel;
  onSuccess?: (channel: NotificationChannel) => void;
  onCancel?: () => void;
};

export function AddChannelForm({
  className,
  channel,
  onSuccess,
  onCancel,
  ...props
}: AddChannelFormProps) {
  const isEditing = !!channel;
  const [type, setType] = useState<NotificationChannelType>(
    (channel?.type as NotificationChannelType) ?? "discord",
  );
  const [configValue, setConfigValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const field = CONFIG_FIELD[type];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldError(null);

    const config = { [field.key]: configValue.trim() };
    const result = createChannelSchema.safeParse({ type, config });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Invalid value.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = isEditing
        ? await updateNotificationChannel(channel.id, type, { config: result.data.config })
        : await createNotificationChannel(result.data.type, result.data.config);

      if (response.error || !response.data) {
        setFormError(response.error ?? "Something went wrong.");
        return;
      }
      setConfigValue("");
      onSuccess?.(response.data);
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
        <Field>
          <FieldLabel htmlFor="channel-type">Channel type</FieldLabel>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as NotificationChannelType);
              setConfigValue("");
            }}
            disabled={isEditing}
          >
            <SelectTrigger id="channel-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_CHANNEL_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isEditing && (
            <FieldDescription>
              A channel&apos;s type can&apos;t be changed -- delete and re-add it instead.
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor="channel-config">{field.label}</FieldLabel>
          <Input
            id="channel-config"
            type={field.inputType}
            placeholder={isEditing ? "Enter a new value to replace the saved one" : field.placeholder}
            required
            aria-invalid={!!fieldError}
            value={configValue}
            onChange={(e) => setConfigValue(e.target.value)}
          />
          {isEditing && (
            <FieldDescription>
              The saved value is masked and can only be replaced, not viewed again.
            </FieldDescription>
          )}
          <FieldError errors={fieldError ? [{ message: fieldError }] : undefined} />
        </Field>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Field orientation="horizontal" className="justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="flex-none">
            {isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add channel"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
