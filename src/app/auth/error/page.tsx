import { CirclePower } from "lucide-react";
import { FieldGroup } from "@/components/ui/field";
import { BRAND_NAME } from "@/features/marketing";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <p className="text-center text-sm text-muted-foreground">
      {params?.error
        ? `Code error: ${params.error}`
        : "An unspecified error occurred."}
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
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
            <h1 className="text-xl font-bold">Sorry, something went wrong.</h1>
          </div>
          <Suspense>
            <ErrorContent searchParams={searchParams} />
          </Suspense>
        </FieldGroup>
      </div>
    </div>
  );
}
