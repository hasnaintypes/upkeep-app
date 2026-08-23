import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
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
      <AppSidebar
        variant="inset"
        userSlot={
          <Suspense fallback={null}>
            <NavUserLoader />
          </Suspense>
        }
      />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
