"use client";

import { CirclePower } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BRAND_NAME } from "@/features/marketing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/lib/toast";
import { updatePassword } from "../lib/actions";
import { DEFAULT_AUTHENTICATED_REDIRECT } from "../constants/routes";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      notify.success("Password updated");
      // Update this route to redirect to an authenticated route. The user already has an active session.
      router.push(DEFAULT_AUTHENTICATED_REDIRECT);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      setError(message);
      notify.error("Couldn't update password", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleUpdatePassword}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <Link
              href="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md">
                <CirclePower className="size-6" />
              </div>
              <span className="sr-only">{BRAND_NAME}</span>
            </Link>
            <h1 className="text-xl font-bold">Set a new password</h1>
            <FieldDescription>
              Please enter your new password below
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="New password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save new password"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
