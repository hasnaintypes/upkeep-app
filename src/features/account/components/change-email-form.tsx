"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { signInWithPassword, updateEmail } from "@/features/auth/lib/actions";

/**
 * Change-email form for the Account page -- previously the account's
 * email was read-only-display-only (a `Card` showing it, no way to change
 * it). Requires the current password before starting the change, same
 * reasoning and same `signInWithPassword` re-auth call as
 * `ChangePasswordForm` -- an email address is exactly the kind of
 * account-recovery-relevant field a hijacked, already-signed-in session
 * shouldn't be able to silently repoint.
 *
 * Doesn't optimistically show the new address as "current" on success --
 * `updateEmail`'s own doc comment explains why: the address doesn't
 * actually change until the confirmation link is clicked, so the success
 * state here is "check your email," not a changed `currentEmail` prop
 * (which the server still hasn't updated).
 */
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
      setError("That's already your current email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: reauthError } = await signInWithPassword(currentEmail, currentPassword);
      if (reauthError) {
        setError("Current password is incorrect.");
        notify.error("Couldn't change email", "Current password is incorrect.");
        return;
      }

      const { error } = await updateEmail(
        newEmail.trim(),
        `${window.location.origin}/dashboard/account`,
      );
      if (error) {
        setError(error.message);
        notify.error("Couldn't change email", error.message);
        return;
      }

      notify.success("Confirmation email sent");
      setSentTo(newEmail.trim());
      setCurrentPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          We sent a confirmation link to <span className="font-medium">{sentTo}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          Your email stays <span className="font-medium">{currentEmail}</span> until you click
          it -- check that inbox (and spam folder) to finish the change.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            setSentTo(null);
            setNewEmail("");
          }}
        >
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-email">New email</FieldLabel>
          <Input
            id="new-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <FieldDescription>Currently {currentEmail}.</FieldDescription>
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="current-password-email">Current password</FieldLabel>
          <Input
            id="current-password-email"
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            required
            aria-invalid={!!error}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Field orientation="horizontal">
          <Button type="submit" disabled={isSubmitting} className="flex-none">
            {isSubmitting ? "Sending..." : "Send confirmation"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
