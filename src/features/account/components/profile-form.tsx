"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { updateProfile } from "@/features/auth/lib/actions";

/**
 * Full name / username form for the settings dialog's Account section -- both stored in
 * Supabase Auth's `user_metadata` (see `updateProfile`'s own doc comment,
 * features/auth/lib/actions.ts), display-only everywhere in this app (shown here and in the
 * sidebar user menu, nowhere else). One combined form with a single "Save profile" button,
 * matching this app's existing explicit-submit convention (`ChangeEmailForm`/
 * `ChangePasswordForm`) rather than per-field autosave.
 */
export function ProfileForm({
  fullName,
  username,
  onSaved,
}: {
  fullName: string;
  username: string;
  onSaved: (data: { fullName: string; username: string }) => void;
}) {
  const [fullNameValue, setFullNameValue] = useState(fullName);
  const [usernameValue, setUsernameValue] = useState(username);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const trimmedFullName = fullNameValue.trim();
      const trimmedUsername = usernameValue.trim();
      const { error } = await updateProfile({
        full_name: trimmedFullName,
        username: trimmedUsername,
      });
      if (error) {
        notify.error("Couldn't save profile", error.message);
        return;
      }
      onSaved({ fullName: trimmedFullName, username: trimmedUsername });
      notify.success("Profile updated");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field orientation="responsive">
          <FieldLabel htmlFor="full-name">Full name</FieldLabel>
          <Input
            id="full-name"
            placeholder="Your name"
            value={fullNameValue}
            onChange={(e) => setFullNameValue(e.target.value)}
          />
        </Field>
        <Field orientation="responsive">
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input
            id="username"
            placeholder="username"
            value={usernameValue}
            onChange={(e) => setUsernameValue(e.target.value)}
          />
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" disabled={isSubmitting} className="flex-none">
            {isSubmitting ? "Saving..." : "Save profile"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
