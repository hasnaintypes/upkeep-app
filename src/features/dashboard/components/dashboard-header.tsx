"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Route -> header title, matching `AppSidebar`'s own nav labels. Falls
 * back to the closest matching prefix so per-project detail pages still
 * show "Projects", not nothing. */
const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/dashboard/projects", title: "Projects" },
  { prefix: "/dashboard/notifications", title: "Notifications" },
  { prefix: "/dashboard", title: "Overview" },
];

function titleForPath(pathname: string): string {
  return PAGE_TITLES.find((entry) => pathname.startsWith(entry.prefix))?.title ?? "Dashboard";
}

/**
 * Dashboard header (adapted from dashboard-01's site-header.tsx -- renamed
 * to avoid confusion with the marketing site's own
 * components/layout/site-header.tsx, a completely separate component).
 * Just the sidebar toggle + a page title derived from the current route,
 * since this app has no document/report title to display like the
 * original block did.
 */
export function DashboardHeader() {
  const pathname = usePathname();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{titleForPath(pathname)}</h1>
      </div>
    </header>
  );
}
