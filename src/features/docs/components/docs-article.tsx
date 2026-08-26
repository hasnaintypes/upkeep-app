"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { normalizePages } from "nextra/normalize-pages";
import type { Heading } from "nextra";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocsPageMap } from "./docs-pagemap-context";

/**
 * The MDX `wrapper` for /docs pages (wired up in src/mdx-components.tsx) --
 * prose container, "on this page" TOC, and prev/next pagination. Reads the
 * page map from `DocsPageMapProvider` (set up by `DocsShell`, the nested
 * layout's shell) since the catch-all route only passes `toc`/`metadata`
 * here, not the page map itself.
 */
export function DocsArticle({ toc, children }: { toc: Heading[]; children: ReactNode }) {
  const pathname = usePathname();
  const pageMap = useDocsPageMap();
  const { flatDocsDirectories, activeIndex } = normalizePages({ list: pageMap, route: pathname });

  const previous = activeIndex > 0 ? flatDocsDirectories[activeIndex - 1] : undefined;
  const next =
    activeIndex < flatDocsDirectories.length - 1 ? flatDocsDirectories[activeIndex + 1] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 gap-10 px-4 py-10 lg:px-8">
      <main className="min-w-0 flex-1">
        <article>{children}</article>

        {(previous || next) && (
          <nav className="mt-12 flex items-center justify-between gap-4 border-t pt-6">
            {previous ? (
              <Button variant="outline" asChild className="justify-start">
                <Link href={previous.route ?? "#"}>
                  <ArrowLeft className="size-4" />
                  {previous.title}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="outline" asChild className="justify-end">
                <Link href={next.route ?? "#"}>
                  {next.title}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </nav>
        )}
      </main>

      {toc.length > 0 && (
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-20 flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">On this page</span>
            <ul className="flex flex-col gap-2 border-l text-sm">
              {toc.map((heading) => (
                <li key={heading.id} className={cn(heading.depth === 3 && "pl-4")}>
                  <a
                    href={`#${heading.id}`}
                    className="-ml-px block border-l border-transparent pl-4 text-muted-foreground hover:border-foreground hover:text-foreground"
                  >
                    {heading.value}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
