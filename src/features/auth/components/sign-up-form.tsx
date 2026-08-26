"use client";

import { CirclePower } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BRAND_NAME } from "@/features/marketing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/lib/toast";
import { signUpWithPassword } from "../lib/actions";
import { AUTH_ROUTES, DEFAULT_AUTHENTICATED_REDIRECT } from "../constants/routes";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      notify.error("Couldn't create account", "Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await signUpWithPassword(
        email,
        password,
        `${window.location.origin}${DEFAULT_AUTHENTICATED_REDIRECT}`,
      );
      if (error) throw error;
      router.push(AUTH_ROUTES.signUpSuccess);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      setError(message);
      notify.error("Couldn't create account", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSignUp}>
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
            <h1 className="text-xl font-bold">Create your {BRAND_NAME} account</h1>
            <FieldDescription>
              Already have an account?{" "}
              <Link href={AUTH_ROUTES.login}>Login</Link>
            </FieldDescription>
          </div>
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
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="repeat-password">Repeat Password</FieldLabel>
            <Input
              id="repeat-password"
              type="password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Field>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating an account..." : "Sign up"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </FieldDescription>
    </div>
  );
}
