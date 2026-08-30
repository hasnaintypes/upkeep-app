"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dashboard-scoped error boundary -- Next.js picks this over the root
 * `src/app/error.tsx` for any crash inside `/dashboard/*`, since it's the
 * closer `error.tsx` to the segment that threw. Only replaces the page
 * content area (`{children}` in `dashboard/layout.tsx`) -- the sidebar and
 * header keep rendering around it, so a crash on one page doesn't strand
 * the user without navigation the way falling back to the bare root error
 * page would.
 */
export default function DashboardError({
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
    <div className="flex flex-1 items-center justify-center">
      <Card variant="soft" className="max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">This page hit an error</p>
            <p className="text-sm text-muted-foreground">
              Something went wrong loading this section. Your other data is fine.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to overview</Link>
            </Button>
            <Button onClick={() => reset()}>Try again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
