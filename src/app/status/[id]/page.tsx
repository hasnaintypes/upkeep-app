import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CirclePower } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { BRAND_NAME } from "@/features/marketing";
import {
  getPublicProjectDailyHistory,
  getPublicProjectResponseTime,
  getPublicProjectStatus,
  PublicStatusView,
} from "@/features/status-pages";

/**
 * Public, unauthenticated status page for one opted-in project (PRD §5.6,
 * Phase 8, #51) -- the "link from a resume/portfolio site" use case. No
 * auth check of any kind: every query here goes through a `security
 * definer` RPC (see supabase/migrations/*_add_public_status_pages.sql)
 * that re-checks `is_public` itself, so this page works identically
 * whether or not the visitor has a session.
 *
 * The actual 404-vs-render decision for a private/nonexistent project is
 * made in src/lib/supabase/proxy.ts (middleware), not here -- with
 * cacheComponents enabled, every dynamic route streams its shell with a
 * 200 status before any page-level `notFound()` could run, so this page
 * can never actually turn the HTTP response into a real 404 on its own
 * (confirmed live: a private project's page still served a cached 200 in
 * a production build even with this fetch un-Suspended and forced
 * per-request via `connection()`). Next.js's own notFound() docs say as
 * much: "With Cache Components, every dynamic route streams a static
 * shell first, so run that check in proxy instead." By the time a request
 * reaches this component, the middleware's `is_project_publicly_visible()`
 * gate has already confirmed the project is public -- `getPublicProjectStatus`
 * returning null here would mean the project was deleted or flipped private
 * in the narrow window between that gate and this fetch, not the normal
 * case. `notFound()` is kept as defense-in-depth for exactly that race, not
 * as the primary access-control mechanism.
 */
async function PublicStatusLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: status, error: statusError } = await getPublicProjectStatus(id);

  if (statusError || !status) {
    notFound();
  }

  const [{ data: dailyHistory }, { data: responseTimeSeries }] = await Promise.all([
    getPublicProjectDailyHistory(id),
    getPublicProjectResponseTime(id),
  ]);

  return (
    <PublicStatusView
      status={status}
      dailyHistory={dailyHistory ?? []}
      responseTimeSeries={responseTimeSeries ?? { kind: "raw", points: [] }}
    />
  );
}

function PublicStatusSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function PublicStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <Link href="/" className="flex w-fit items-center gap-2 font-medium">
        <CirclePower className="size-5" />
        {BRAND_NAME}
      </Link>

      <Suspense fallback={<PublicStatusSkeleton />}>
        <PublicStatusLoader params={params} />
      </Suspense>
    </div>
  );
}
