"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export type NavMainItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

/**
 * Primary sidebar nav (adapted from shadcn's dashboard-01 block for the
 * dashboard shell). Two differences from the block as published:
 * - Items actually navigate: `asChild` + `next/link`, with `isActive`
 *   derived from `usePathname()` -- the original block's items only render
 *   a `<span>` with `url: "#"`, which goes nowhere.
 * - The "Quick Create" slot is real: `addProjectSlot` renders the actual
 *   "Add project" trigger, instead of the block's placeholder button +
 *   unused mail/inbox icon action, which has no equivalent feature here.
 *
 * `addProjectSlot` is a `ReactNode`, not an imported `AddProjectSheet`
 * component -- this file is a Client Component, and the trigger needs
 * `getExistingCollections()` (a live Supabase fetch, server-only). A
 * Client Component can't import a Server Component and can't safely reach
 * into `@/features/projects`'s barrel either (it also re-exports
 * `lib/queries.ts`, which pulls in `next/headers` -- that's what broke the
 * build here previously). The fix is the same pattern `dashboard/layout.tsx`
 * already uses for `NavUser`'s `userSlot`: a Server Component ancestor
 * (`dashboard/layout.tsx`) fetches/renders the trigger and passes the
 * result down as a prop, so this component depends on nothing from the
 * projects feature at all.
 */
export function NavMain({
  items,
  addProjectSlot,
}: {
  items: NavMainItem[];
  addProjectSlot: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>{addProjectSlot}</SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              item.url === "/dashboard" ? pathname === item.url : pathname.startsWith(item.url);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * A single skeleton nav row -- fixed label width, not shadcn's stock
 * `SidebarMenuSkeleton` (which randomizes its width via `Math.random()` on
 * every render). That's fine when it only ever renders after client
 * hydration, but this fallback can end up in a *static* route's prerendered
 * shell (e.g. /dashboard, which has no dynamic segments), and Next.js
 * rejects any unstable value like `Math.random()` reachable from a
 * statically prerendered shell ("blocking prerender" build error).
 */
export function NavLinkSkeleton({ width }: { width: string }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md px-2">
      <Skeleton className="size-4 shrink-0 rounded-md" />
      <Skeleton className="h-4 flex-1" style={{ maxWidth: width }} />
    </div>
  );
}

/**
 * Loading fallback for just the nav links -- `AppSidebar` wraps `<NavMain>`
 * (not itself) in `<Suspense>` with this, so the sidebar's logo/header and
 * user footer render immediately and only the link rows show a skeleton,
 * instead of the whole sidebar going blank the way one outer boundary
 * around the entire `<AppSidebar>` used to.
 */
export function NavMainSkeleton({ itemCount }: { itemCount: number }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLinkSkeleton width="60%" />
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {Array.from({ length: itemCount }).map((_, index) => (
            <SidebarMenuItem key={index}>
              <NavLinkSkeleton width={index % 2 === 0 ? "75%" : "55%"} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
