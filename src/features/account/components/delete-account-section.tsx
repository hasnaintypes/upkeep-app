"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/toast";
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { signOut } from "@/features/auth/lib/actions";
import { deleteAccount } from "../lib/actions";

/**
 * Destructive "danger zone" section for the Account page. Deleting an
 * account cascades to everything it owns (projects, notification
 * channels, API keys -- see lib/actions.ts's `deleteAccount` doc comment
 * for why no app-level cleanup is needed beyond that one call), so this
 * needs more friction than the plain confirm dialog used for project
 * deletion (features/projects/components/project-list.tsx): the confirm
 * button stays disabled until the typed value exactly matches the
 * account's own email.
 */
export function DeleteAccountSection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setConfirmValue("");
      setError(null);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      const { error } = await deleteAccount();
      if (error) {
        setError(error);
        notify.error("Couldn't delete account", error);
        return;
      }
      // The account (and its session) is gone server-side regardless of
      // whether signOut() itself succeeds -- it only clears local cookies.
      await signOut();
      notify.success("Account deleted");
      router.push(AUTH_ROUTES.login);
    } finally {
      setIsDeleting(false);
    }
  }

  const canConfirm = confirmValue === email;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
          Danger zone
        </CardTitle>
        <CardDescription>
          Permanently delete your account and everything in it -- projects, check
          history, incidents, notification channels, and API keys. This can&apos;t
          be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account and every project, check,
                incident, notification channel, and API key you own. This
                can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="delete-account-confirm">
                Type <span className="font-mono">{email}</span> to confirm
              </FieldLabel>
              <Input
                id="delete-account-confirm"
                autoComplete="off"
                value={confirmValue}
                onChange={(e) => setConfirmValue(e.target.value)}
              />
              <FieldDescription>Case-sensitive, must match exactly.</FieldDescription>
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={!canConfirm || isDeleting}
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmDelete();
                }}
              >
                {isDeleting ? "Deleting..." : "Delete account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
