"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PageMapItem } from "nextra";

/**
 * Nextra's catch-all route (src/app/docs/[[...mdxPath]]/page.tsx) only
 * passes `toc`/`metadata` to the MDX wrapper, not the page map -- but the
 * wrapper (`DocsArticle`) needs it too, for prev/next pagination via
 * `normalizePages`. `DocsShell` (the nested `app/docs/layout.tsx`'s shell,
 * which already fetched the page map for the sidebar) provides it here so
 * `DocsArticle`, rendered deeper in the tree by the catch-all route, can
 * read it without a second `getPageMap()` call or awkward prop drilling
 * across the layout/page boundary.
 */
const DocsPageMapContext = createContext<PageMapItem[] | null>(null);

export function DocsPageMapProvider({
  pageMap,
  children,
}: {
  pageMap: PageMapItem[];
  children: ReactNode;
}) {
  return <DocsPageMapContext.Provider value={pageMap}>{children}</DocsPageMapContext.Provider>;
}

export function useDocsPageMap(): PageMapItem[] {
  const pageMap = useContext(DocsPageMapContext);
  if (!pageMap) {
    throw new Error("useDocsPageMap must be used within DocsPageMapProvider");
  }
  return pageMap;
}
