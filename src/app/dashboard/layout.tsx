import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, DashboardHeader, NavUser } from "@/features/dashboard";

/**
 * Fetches the signed-in user's email for the sidebar's `NavUser` footer.
 * Isolated in its own async component + `<Suspense>`, per this project's
 * standard pattern for dynamic Supabase calls under `cacheComponents: true`
 * (see AGENTS.md's Gotchas section) -- same reasoning as `AuthButton`
 * (features/auth/components/auth-button.tsx), which this mirrors for the
 * dashboard's sidebar instead of the marketing site's header.
 *
 * Not an auth *guard*: every dashboard page already redirects
 * unauthenticated visitors itself (see e.g. dashboard/page.tsx's
 * `OverviewLoader`). If that claims lookup somehow comes back empty here
 * anyway, this renders nothing rather than guessing -- the page-level
 * guard is what actually protects the route.
 */
async function NavUserLoader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  return email ? <NavUser email={email} /> : null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider className="dashboard-shell dark">
      {/* AppSidebar (via NavMain) and DashboardHeader both call
          usePathname() for active-route highlighting/page titles -- a
          dynamic client hook, which under cacheComponents: true must be
          inside its own <Suspense> boundary or the build fails with a
          "blocking prerender" error. This only surfaces for a *dynamic*
          route (e.g. /dashboard/projects/[id], #30) that has no
          generateStaticParams -- known static routes like /dashboard don't
          hit it, since Next.js can bake a fixed pathname into their shell
          at build time. */}
      <Suspense fallback={<Skeleton className="hidden h-svh w-(--sidebar-width) md:block" />}>
        <AppSidebar
          variant="inset"
          userSlot={
            <Suspense fallback={null}>
              <NavUserLoader />
            </Suspense>
          }
        />
      </Suspense>
      <SidebarInset>
        <Suspense fallback={<Skeleton className="h-12 w-full" />}>
          <DashboardHeader />
        </Suspense>
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
