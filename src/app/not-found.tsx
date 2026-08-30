import Link from "next/link";
import { ArrowLeft, XCircle } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Global 404 -- Next.js renders this for any unmatched URL app-wide (App
 * Router convention: a root `not-found.tsx` next to `layout.tsx`, so it's
 * rendered as that layout's `children` and must not repeat the root
 * layout's own `<html>`/`<body>`). Deliberately standalone chrome, not
 * `SiteHeader`/`SiteFooter` -- those only come from the `(site)` route
 * group's own layout, which doesn't wrap a root-level `not-found.tsx`, and
 * an unmatched URL can just as easily be a mistyped `/dashboard/...` or
 * `/auth/...` link as a marketing one. Same standalone, centered pattern as
 * `auth/error/page.tsx` for that reason -- it has to look right regardless
 * of which part of the app a broken link pointed into.
 *
 * The "down" badge is this page's one deliberate signature touch: it
 * reuses the exact XCircle icon + literal `destructive` red this app
 * already uses for a "down" check (`STATUS_META.down`,
 * `features/dashboard/constants/index.ts`) -- an uptime monitor's own 404
 * reads as "this page is down", not a generic error graphic, without
 * introducing any color the rest of the app doesn't already treat as
 * meaningful.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6 text-center md:p-10">
      <Link href="/" className="flex items-center gap-2">
        <Logo />
      </Link>
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium tracking-wide text-destructive uppercase">
          <XCircle className="size-3.5" />
          404 &middot; Down
        </span>
        <h1 className="text-2xl font-bold">This page is down</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          We couldn&apos;t find a check for this URL. It may have been moved,
          renamed, or never existed.
        </p>
      </div>
      <Button asChild>
        <Link href="/">
          <ArrowLeft />
          Go home
        </Link>
      </Button>
    </div>
  );
}
