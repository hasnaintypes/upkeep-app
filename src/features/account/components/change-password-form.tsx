"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { signInWithPassword, updatePassword } from "@/features/auth/lib/actions";

/**
 * Inline sibling of `features/auth/components/update-password-form.tsx`
 * for use inside the dashboard's Account page -- same `updatePassword()`
 * call, but no logo/header and no redirect on success (the standalone
 * form is reached from a password-reset email link and needs to land the
 * user somewhere; this one is already inside the dashboard).
 *
 * Requires the current password before changing it: `updateUser({
 * password })` alone only needs an active session (no re-auth), so
 * without this, anyone who got hold of an already-signed-in browser tab
 * could silently take over the account by just setting a new password --
 * re-verified here via `signInWithPassword(email, currentPassword)` (the
 * same call the login form itself uses), which both confirms the current
 * password and refreshes the session, rather than a separate
 * password-verification endpoint Supabase Auth doesn't expose.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("New passwords do not match.");
      notify.error("Couldn't update password", "New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: reauthError } = await signInWithPassword(email, currentPassword);
      if (reauthError) {
        setError("Current password is incorrect.");
        notify.error("Couldn't update password", "Current password is incorrect.");
        return;
      }

      const { error } = await updatePassword(password);
      if (error) {
        setError(error.message);
        notify.error("Couldn't update password", error.message);
        return;
      }
      notify.success("Password updated");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="current-password">Current password</FieldLabel>
          <Input
            id="current-password"
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            required
            aria-invalid={!!error}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>
            You&apos;ll stay signed in on this device after changing it.
          </FieldDescription>
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="confirm-new-password">Confirm new password</FieldLabel>
          <Input
            id="confirm-new-password"
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            required
            aria-invalid={!!error}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Field orientation="horizontal">
          <Button type="submit" disabled={isSubmitting} className="flex-none">
            {isSubmitting ? "Saving..." : "Save new password"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
