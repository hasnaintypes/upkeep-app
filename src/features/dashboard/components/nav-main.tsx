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
