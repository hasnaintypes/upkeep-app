import { useMDXComponents as getNextraComponents } from "nextra/mdx-components";
import type { MDXComponents } from "nextra/mdx-components";
import Link from "next/link";
import { AlertTriangle, Info, Lightbulb, OctagonAlert } from "lucide-react";
import { cn, isExternalUrl } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DocsArticle } from "@/features/docs";

/**
 * Overrides Nextra's default MDX element renderers with this app's own
 * design system instead of Nextra's own (blue-accented, its own radius
 * scale) defaults -- every doc page under /docs should read as part of
 * Upkeep, not an embedded third-party tool. Only `wrapper` is left to the
 * catch-all route (src/app/docs/[[...mdxPath]]/page.tsx), which supplies
 * the actual page chrome via src/features/docs.
 */

const CALLOUT_CONFIG = {
  note: { icon: Info, variant: "default" as const },
  tip: { icon: Lightbulb, variant: "default" as const },
  warning: { icon: AlertTriangle, variant: "default" as const },
  danger: { icon: OctagonAlert, variant: "destructive" as const },
};

/** `<Callout type="tip">...</Callout>` in MDX -- this app's own admonition
 * instead of nextra/components' `Callout`, which hardcodes green/red/blue/
 * yellow/purple Tailwind classes that would clash with this app's strictly
 * achromatic OKLCH palette. */
function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof CALLOUT_CONFIG;
  title?: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, variant } = CALLOUT_CONFIG[type];
  return (
    <Alert variant={variant} className="my-4">
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

const themedComponents: MDXComponents = {
  h1: (props) => (
    <h1 className="mt-2 mb-4 text-3xl font-bold tracking-tight text-foreground" {...props} />
  ),
  h2: (props) => (
    <h2
      className="mt-10 mb-4 scroll-mt-24 border-b pb-2 text-2xl font-semibold tracking-tight text-foreground"
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className="mt-8 mb-3 scroll-mt-24 text-xl font-semibold text-foreground" {...props} />
  ),
  h4: (props) => (
    <h4 className="mt-6 mb-2 scroll-mt-24 text-base font-semibold text-foreground" {...props} />
  ),
  p: (props) => <p className="my-4 leading-7 text-muted-foreground" {...props} />,
  a: ({ href = "", className, ...props }) => {
    // Nextra's own Anchor override types `href` as `next/link`'s `Url`
    // (`string | UrlObject`), since this component can render either a
    // plain `<a>` or a `<Link>` -- but a real MDX/markdown anchor's `href`
    // attribute is always a literal string in practice. Narrowed only for
    // this app's own `isExternalUrl(href: string)` check; the original
    // (wider-typed) `href` still passes straight through to `<Link>` below
    // unchanged.
    const hrefString = typeof href === "string" ? href : "";
    return (
      <Link
        href={href}
        target={isExternalUrl(hrefString) ? "_blank" : undefined}
        rel={isExternalUrl(hrefString) ? "noreferrer" : undefined}
        className={cn("font-medium text-foreground underline underline-offset-4", className)}
        {...props}
      />
    );
  },
  ul: (props) => <ul className="my-4 ml-6 list-disc space-y-2 text-muted-foreground" {...props} />,
  ol: (props) => (
    <ol className="my-4 ml-6 list-decimal space-y-2 text-muted-foreground" {...props} />
  ),
  li: (props) => <li className="leading-7" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-4 border-l-2 border-border pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-8 border-border" {...props} />,
  code: (props) => (
    <code
      className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground"
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-4 overflow-x-auto rounded-lg border bg-card p-4 font-mono text-sm text-card-foreground",
        className,
      )}
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border-b bg-muted px-3 py-2 text-left font-medium text-foreground" {...props} />
  ),
  td: (props) => <td className="border-b px-3 py-2 text-muted-foreground" {...props} />,
  Callout,
  wrapper: ({ toc, children }) => <DocsArticle toc={toc}>{children}</DocsArticle>,
};

const nextraComponents = getNextraComponents(themedComponents);

export const useMDXComponents = (components?: MDXComponents) => ({
  ...nextraComponents,
  ...components,
});
