"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary -- Next.js renders this in place of any page under
 * the root layout that throws during render (App Router convention: a
 * `error.tsx` next to `layout.tsx`). Must be a Client Component (Next.js
 * requirement for error boundaries) and must not repeat the root layout's
 * own `<html>`/`<body>`, same reasoning as `not-found.tsx`. Deliberately
 * generic/standalone chrome for the same reason that file is: an error here
 * can come from marketing, auth, or docs pages alike, not just one section.
 *
 * `/dashboard` has its own, more specific `error.tsx` (keeps the sidebar
 * visible on a crash instead of falling back to this bare page) -- Next.js
 * picks whichever `error.tsx` is closest to the segment that threw, so this
 * one only ever fires outside `/dashboard`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6 text-center md:p-10">
      <Link href="/" className="flex items-center gap-2">
        <Logo />
      </Link>
      <div className="flex flex-col items-center gap-3">
        <TriangleAlert className="size-10 text-destructive" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error interrupted this page. You can try again, or head
          back home.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/">
            <ArrowLeft />
            Go home
          </Link>
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
