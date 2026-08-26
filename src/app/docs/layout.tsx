import { getPageMap } from "nextra/page-map";
import { DocsShell } from "@/features/docs";

/**
 * Nested layout for /docs -- does NOT own <html>/<body> (the root
 * src/app/layout.tsx already does, and its ThemeProvider covers this route
 * too since it wraps every page). Fetches the page map once here and hands
 * it to `DocsShell`, which builds the sidebar and makes the page map
 * available to `DocsArticle` (the MDX wrapper) for prev/next pagination.
 */
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const pageMap = await getPageMap("/docs");
  return <DocsShell pageMap={pageMap}>{children}</DocsShell>;
}
