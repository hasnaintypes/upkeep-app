import { Suspense } from "react";
import Link from "next/link";
import { CirclePower } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { BRAND_NAME } from "@/features/marketing";
import { getPublicProjectsSummary, PublicPortfolioView } from "@/features/status-pages";

/**
 * Aggregate, unauthenticated portfolio status page (PRD §5.6, Phase 8,
 * #53) -- every currently-public project in one place, "embeddable or
 * linkable from a personal site." Single-owner-first scope, deliberately
 * (per this issue's own instruction): lists every `is_public = true`
 * project app-wide, not scoped to a specific user's portfolio -- there's no
 * multi-tenant portfolio routing to build until PRD §5.7 multi-user support
 * actually ships (see the get_public_projects_summary migration's own top
 * comment).
 *
 * No middleware gate needed here (unlike `/status/[id]`'s `is_public`
 * check in src/lib/supabase/proxy.ts): there's no single project's
 * existence to leak via a status-code side channel -- an empty portfolio
 * (no public projects yet) is just a normal, valid empty state, not a 404,
 * and `get_public_projects_summary()` already filters to `is_public = true`
 * itself, so there's nothing left to gate.
 */
async function PublicPortfolioLoader() {
  const { data: projects } = await getPublicProjectsSummary();
  return <PublicPortfolioView projects={projects} />;
}

function PublicPortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default function PublicPortfolioPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <Link href="/" className="flex w-fit items-center gap-2 font-medium">
        <CirclePower className="size-5" />
        {BRAND_NAME}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Status</h1>
        <p className="text-sm text-muted-foreground">
          Live status for every publicly shared project.
        </p>
      </div>

      <Suspense fallback={<PublicPortfolioSkeleton />}>
        <PublicPortfolioLoader />
      </Suspense>
    </div>
  );
}
