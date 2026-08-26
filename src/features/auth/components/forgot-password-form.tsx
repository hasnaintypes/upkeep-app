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
import { useState } from "react";
import { notify } from "@/lib/toast";
import { resetPasswordForEmail } from "../lib/actions";
import { AUTH_ROUTES } from "../constants/routes";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // The url which will be included in the email. This URL needs to be configured in your redirect URLs in the Supabase dashboard at https://supabase.com/dashboard/project/_/auth/url-configuration
      const { error } = await resetPasswordForEmail(
        email,
        `${window.location.origin}${AUTH_ROUTES.updatePassword}`,
      );
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      setError(message);
      notify.error("Couldn't send reset email", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleForgotPassword}>
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
            {success ? (
              <>
                <h1 className="text-xl font-bold">Check your email</h1>
                <FieldDescription>
                  Password reset instructions sent
                </FieldDescription>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">Reset your password</h1>
                <FieldDescription>
                  Type in your email and we&apos;ll send you a link to reset
                  your password
                </FieldDescription>
              </>
            )}
          </div>
          {success ? (
            <p className="text-center text-sm text-muted-foreground">
              If you registered using your email and password, you will
              receive a password reset email.
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send reset email"}
                </Button>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Already have an account? <Link href={AUTH_ROUTES.login}>Login</Link>
      </FieldDescription>
    </div>
  );
}
