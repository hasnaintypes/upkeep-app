import { CirclePower } from "lucide-react";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { BRAND_NAME } from "@/features/marketing";
import Link from "next/link";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
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
            <h1 className="text-xl font-bold">Thank you for signing up!</h1>
            <FieldDescription>Check your email to confirm</FieldDescription>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            You&apos;ve successfully signed up. Please check your email to
            confirm your account before signing in.
          </p>
        </FieldGroup>
      </div>
    </div>
  );
}
