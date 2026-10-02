import { Suspense } from "react";
import { PlusCircleIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AddProjectTrigger } from "@/features/projects";
import { AppSidebar, DashboardHeader, NavLinkSkeleton, NavUser } from "@/features/dashboard";
import { SettingsDialogProvider } from "@/components/layout/settings-dialog";

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
    // Wraps the whole layout (not just the sidebar) since the settings dialog it provides --
    // replacing the old standalone /dashboard/settings and /dashboard/account pages, see
    // settings-dialog.tsx's own doc comment -- is opened from more than just NavUser's
    // dropdown (ProjectNotificationRules' "Add one" prompt, several layers deep in page
    // content, needs it too). Needs no server-fetched props of its own (unlike userSlot
    // below) -- its data loads lazily on first open via a "use server" action -- so wrapping
    // here adds no new async boundary/Suspense requirement.
    <SettingsDialogProvider>
      <SidebarProvider className="dashboard-shell dark">
        {/* AppSidebar (via NavMain) and DashboardHeader both call
            usePathname() for active-route highlighting/page titles -- a
            dynamic client hook, which under cacheComponents: true must be
            inside its own <Suspense> boundary or the build fails with a
            "blocking prerender" error. This only surfaces for a *dynamic*
            route (e.g. /dashboard/projects/[id], #30) that has no
            generateStaticParams -- known static routes like /dashboard don't
            hit it, since Next.js can bake a fixed pathname into their shell
            at build time. The boundary itself lives *inside* AppSidebar
            (wrapping just <NavMain>, see app-sidebar.tsx/nav-main.tsx) rather
            than wrapping the whole component here, so the logo/header and
            user footer render immediately and only the nav links show a
            skeleton -- not the entire sidebar. */}
        <AppSidebar
          variant="inset"
          userSlot={
            <Suspense fallback={null}>
              <NavUserLoader />
            </Suspense>
          }
          addProjectSlot={
            <Suspense fallback={<NavLinkSkeleton width="70%" />}>
              <AddProjectTrigger
                trigger={
                  <SidebarMenuButton
                    tooltip="Add project"
                    className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                  >
                    <PlusCircleIcon />
                    <span>Add project</span>
                  </SidebarMenuButton>
                }
              />
            </Suspense>
          }
        />
        <SidebarInset>
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <DashboardHeader />
          </Suspense>
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SettingsDialogProvider>
  );
}
