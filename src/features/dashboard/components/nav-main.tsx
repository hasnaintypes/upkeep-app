"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircleIcon, type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
 * - The "Quick Create" slot is real: "Add project" links straight to
 *   /dashboard/projects/new instead of the block's placeholder button +
 *   unused mail/inbox icon action, which has no equivalent feature here.
 */
export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Add project"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <Link href="/dashboard/projects/new">
                <PlusCircleIcon />
                <span>Add project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
