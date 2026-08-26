"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  BellIcon,
  CirclePower,
  FolderIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SirenIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BRAND_NAME } from "@/features/marketing";
import { NavMain, type NavMainItem } from "./nav-main";

const NAV_MAIN_ITEMS: NavMainItem[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Projects", url: "/dashboard/projects", icon: FolderIcon },
  { title: "Incidents", url: "/dashboard/incidents", icon: SirenIcon },
  { title: "Notifications", url: "/dashboard/notifications", icon: BellIcon },
  { title: "API Keys", url: "/dashboard/api-keys", icon: KeyRoundIcon },
];

/**
 * Dashboard sidebar shell (adapted from shadcn's dashboard-01 block, see
 * https://ui.shadcn.com/blocks -- installed via `pnpm dlx shadcn add
 * sidebar avatar dropdown-menu`, this component itself hand-written to
 * replace the block's own app-sidebar.tsx). Real nav items instead of
 * the block's five fake ones (Dashboard/Lifecycle/Analytics/Projects/Team,
 * all `url: "#"`), and no `NavDocuments`/`NavSecondary` sections -- this
 * app has no documents library or settings/help pages yet, so those
 * sections would be dead links.
 *
 * `userSlot`/`addProjectSlot` -- not fetched-here props -- because this is
 * a Client Component (the sidebar's collapse/open state needs
 * `SidebarProvider` context) and both the signed-in user's email and the
 * "Add project" trigger's `existingCollections` autocomplete data require
 * dynamic, server-only Supabase calls. Same `authSlot`-style composition
 * already used by `SiteNav`/`SiteHeader` (components/layout/): the
 * dashboard layout (a Server Component) fetches server-side and passes the
 * rendered result down as a slot, rather than this component (or `NavMain`)
 * reaching into Supabase or the projects feature itself.
 */
export function AppSidebar({
  userSlot,
  addProjectSlot,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  userSlot: ReactNode;
  addProjectSlot: ReactNode;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/">
                <CirclePower className="h-5 w-5" />
                <span className="text-base font-semibold">{BRAND_NAME}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_MAIN_ITEMS} addProjectSlot={addProjectSlot} />
      </SidebarContent>
      <SidebarFooter>{userSlot}</SidebarFooter>
    </Sidebar>
  );
}
