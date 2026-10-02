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
import { notify } from "@/lib/toast";
import { createPlatformAccount, updatePlatformAccount } from "../lib/actions";
import { platformAccountSchema } from "../lib/validation";
import { PLATFORM_ACCOUNT_DEFAULTS } from "../constants";
import type { HostingPlatformWithTiers, PlatformAccount } from "../types";

type PlatformAccountFormProps = React.ComponentPropsWithoutRef<"form"> & {
  platforms: HostingPlatformWithTiers[];
  /** When provided, the form updates this account instead of creating a new one. */
  account?: PlatformAccount;
  onSuccess?: (account: PlatformAccount) => void;
  onCancel?: () => void;
};

/**
 * Create/edit form for a platform account (docs/ROADMAP.md Phase 12). Cascading platform ->
 * tier selects (changing platform resets the tier choice to whatever that platform's first
 * tier is, since a tier belongs to exactly one platform); picking a tier pre-fills the quota
 * field from that tier's own preset, but the field stays editable -- presets drift and some
 * tiers (Railway, a custom VPS) have no preset number at all.
 */
export function PlatformAccountForm({
  className,
  platforms,
  account,
  onSuccess,
  onCancel,
  ...props
}: PlatformAccountFormProps) {
  const isEditing = !!account;
  const initialPlatformId =
    account?.platform_id ??
    platforms[0]?.id ??
    "";
  const initialTiers = platforms.find((p) => p.id === initialPlatformId)?.tiers ?? [];
  const initialTier = initialTiers.find((t) => t.id === account?.tier_id) ?? initialTiers[0];
  const initialTierId = initialTier?.id ?? "";

  const [platformId, setPlatformId] = useState(initialPlatformId);
  const [tierId, setTierId] = useState(initialTierId);
  const [label, setLabel] = useState(account?.label ?? "");
  const [quotaInput, setQuotaInput] = useState(() => {
    // Editing an existing account always shows its own saved value (even if null/cleared) --
    // only a brand-new account pre-fills from the initially-selected tier's preset, same as
    // handlePlatformChange/handleTierChange do for a later selection.
    if (account) {
      return account.quota_minutes_per_month != null ? String(account.quota_minutes_per_month) : "";
    }
    return initialTier?.free_quota_minutes_per_month != null
      ? String(initialTier.free_quota_minutes_per_month)
      : "";
  });
  const [assumedMsPerRequest, setAssumedMsPerRequest] = useState(
    account?.assumed_ms_per_request ?? PLATFORM_ACCOUNT_DEFAULTS.assumedMsPerRequest,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tiers = platforms.find((p) => p.id === platformId)?.tiers ?? [];

  function handlePlatformChange(nextPlatformId: string) {
    setPlatformId(nextPlatformId);
    const nextTiers = platforms.find((p) => p.id === nextPlatformId)?.tiers ?? [];
    const nextTier = nextTiers[0];
    setTierId(nextTier?.id ?? "");
    setQuotaInput(
      nextTier?.free_quota_minutes_per_month != null
        ? String(nextTier.free_quota_minutes_per_month)
        : "",
    );
  }

  function handleTierChange(nextTierId: string) {
    setTierId(nextTierId);
    const nextTier = tiers.find((t) => t.id === nextTierId);
    setQuotaInput(
      nextTier?.free_quota_minutes_per_month != null
        ? String(nextTier.free_quota_minutes_per_month)
        : "",
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldError(null);

    const result = platformAccountSchema.safeParse({
      label,
      platform_id: platformId,
      tier_id: tierId,
      quota_minutes_per_month: quotaInput.trim() === "" ? null : Number(quotaInput),
      assumed_ms_per_request: assumedMsPerRequest,
    });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Invalid value.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = isEditing
        ? await updatePlatformAccount(account.id, result.data)
        : await createPlatformAccount({ ...result.data, quota_minutes_per_month: result.data.quota_minutes_per_month });

      if (response.error || !response.data) {
        const message = response.error ?? "Something went wrong.";
        setFormError(message);
        notify.error(isEditing ? "Couldn't save account" : "Couldn't add account", message);
        return;
      }
      notify.success(isEditing ? "Account updated" : "Account added");
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
          <FieldLabel htmlFor="platform-account-label">Label</FieldLabel>
          <Input
            id="platform-account-label"
            placeholder="e.g. My Render account"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="platform-account-platform">Platform</FieldLabel>
          <Select value={platformId} onValueChange={handlePlatformChange}>
            <SelectTrigger id="platform-account-platform" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((platform) => (
                <SelectItem key={platform.id} value={platform.id}>
                  {platform.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="platform-account-tier">Tier</FieldLabel>
          <Select value={tierId} onValueChange={handleTierChange}>
            <SelectTrigger id="platform-account-tier" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>
                  {tier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tiers.find((t) => t.id === tierId)?.notes && (
            <FieldDescription>{tiers.find((t) => t.id === tierId)?.notes}</FieldDescription>
          )}
        </Field>

        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor="platform-account-quota">Monthly quota (minutes)</FieldLabel>
          <Input
            id="platform-account-quota"
            type="number"
            min={0}
            placeholder="Leave blank for unlimited / not tracked"
            value={quotaInput}
            onChange={(e) => setQuotaInput(e.target.value)}
          />
          <FieldDescription>
            Pre-filled from the tier&apos;s known free allowance -- an estimate, not a real
            measurement. Adjust it, or clear it if this account isn&apos;t budget-constrained.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="platform-account-assumed-ms">
            Assumed cost per ping (ms)
          </FieldLabel>
          <Input
            id="platform-account-assumed-ms"
            type="number"
            min={1}
            required
            value={assumedMsPerRequest}
            onChange={(e) => setAssumedMsPerRequest(Number(e.target.value))}
          />
          <FieldDescription>
            How long one health check/keep-alive ping is assumed to run on this platform -- the
            one knob that converts a minute budget into a check interval. Raise it if your
            health endpoint does real work (DB pings, etc.), lower it for a near-instant static
            response.
          </FieldDescription>
        </Field>

        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <FieldError errors={fieldError ? [{ message: fieldError }] : undefined} />

        <Field orientation="horizontal" className="justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="flex-none">
            {isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add account"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
