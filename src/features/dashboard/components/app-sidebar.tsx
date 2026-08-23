"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CirclePower, FolderIcon, LayoutDashboardIcon } from "lucide-react";
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
];

/**
 * Dashboard sidebar shell (adapted from shadcn's dashboard-01 block, see
 * https://ui.shadcn.com/blocks -- installed via `pnpm dlx shadcn add
 * sidebar avatar dropdown-menu`, this component itself hand-written to
 * replace the block's own app-sidebar.tsx). Two real nav items instead of
 * the block's five fake ones (Dashboard/Lifecycle/Analytics/Projects/Team,
 * all `url: "#"`), and no `NavDocuments`/`NavSecondary` sections -- this
 * app has no documents library or settings/help pages yet, so those
 * sections would be dead links.
 *
 * `userSlot` -- not a fetched-here `user` prop -- because this is a Client
 * Component (the sidebar's collapse/open state needs `SidebarProvider`
 * context) and fetching the signed-in user's email is a dynamic,
 * server-only Supabase call. Same `authSlot`-style composition already
 * used by `SiteNav`/`SiteHeader` (components/layout/): the dashboard
 * layout (a Server Component) fetches the user server-side and passes the
 * rendered result down as a slot, rather than this component reaching for
 * Supabase itself.
 */
export function AppSidebar({
  userSlot,
  ...props
}: React.ComponentProps<typeof Sidebar> & { userSlot: ReactNode }) {
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
        <NavMain items={NAV_MAIN_ITEMS} />
      </SidebarContent>
      <SidebarFooter>{userSlot}</SidebarFooter>
    </Sidebar>
  );
}
