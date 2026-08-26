"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePower } from "lucide-react";
import type { PageMapItem } from "nextra";
import { normalizePages } from "nextra/normalize-pages";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { BRAND_NAME } from "@/features/marketing";
import { DocsPageMapProvider } from "./docs-pagemap-context";

/**
 * Docs shell for /docs (this app's own shadcn `Sidebar`, the same
 * primitives `AppSidebar` uses for /dashboard -- not nextra-theme-docs) so
 * /docs reads as a sibling section of this app instead of an embedded
 * third-party tool. Rendered from the nested `app/docs/layout.tsx`, which
 * fetches `pageMap` once via `getPageMap('/docs')`; this component both
 * builds the sidebar tree from it and makes it available to `DocsArticle`
 * (rendered inside `children`, deeper in the tree, for prev/next
 * pagination) via `DocsPageMapProvider`.
 */
export function DocsShell({
  pageMap,
  children,
}: {
  pageMap: PageMapItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { docsDirectories } = normalizePages({ list: pageMap, route: pathname });

  return (
    <DocsPageMapProvider pageMap={pageMap}>
      <SidebarProvider>
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
                  <Link href="/">
                    <CirclePower className="h-5 w-5" />
                    <span className="text-base font-semibold">{BRAND_NAME} Docs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {docsDirectories.map((item) => (
                    <SidebarMenuItem key={item.route ?? item.title}>
                      <SidebarMenuButton asChild isActive={pathname === item.route}>
                        <Link href={item.route ?? "#"}>{item.title}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex min-h-svh flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                {BRAND_NAME}
              </Link>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm font-medium">Docs</span>
            </div>
          </header>
          {children}
        </div>
      </SidebarProvider>
    </DocsPageMapProvider>
  );
}
