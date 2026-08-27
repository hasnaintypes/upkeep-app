import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public status page gate (PRD §5.6, Phase 8, #51), checked here rather than in the page
  // component itself: with cacheComponents enabled, every dynamic route streams its shell with a
  // 200 status before any page-level notFound() can run, so the HTTP status can never actually
  // become 404 from inside src/app/status/[id]/page.tsx -- confirmed live (a private project's
  // page still served a cached 200 in a production build even with the check un-Suspended in the
  // page) and matches Next.js's own notFound() docs ("With Cache Components, every dynamic route
  // streams a static shell first, so run that check in proxy instead"). Middleware runs before
  // any rendering begins, so it's the only layer that can set a genuine 404 for this per-request,
  // data-dependent decision. `is_project_publicly_visible()` (see the
  // add_public_status_page_gate migration) is a cheap true/false check, deliberately not
  // `get_public_project_status()`'s full uptime aggregation -- this runs on every matching
  // request, not just once per real page view. A plain `NextResponse` with no body/rendered UI is
  // returned for a private/nonexistent/malformed id, so nothing about the project is observable
  // in the deny case (this issue's own "does not leak project metadata" acceptance criterion) --
  // the page's own not-found UI is only ever reached for the (public, existing) allow case below.
  // Placed after getClaims() (not before) per the ordering warning immediately above -- this
  // RPC call is unrelated to the session cookie-refresh logic getClaims() performs, but the
  // warning is about *any* code running between the two, not specifically auth-related code.
  const statusPageMatch = request.nextUrl.pathname.match(/^\/status\/([^/]+)\/?$/);
  if (statusPageMatch) {
    const { data: isPublic, error } = await supabase.rpc("is_project_publicly_visible", {
      p_project_id: statusPageMatch[1],
    });
    if (error || !isPublic) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return supabaseResponse;
  }

  // `/api/*` is excluded here: those routes are for programmatic,
  // non-browser callers with no Supabase session cookie by design (e.g.
  // POST /api/projects/register, #19/#47, authenticated by its own API key
  // inside the route handler, not a session). Without this exclusion every
  // such request was silently 307-redirected to /auth/login before ever
  // reaching the route, regardless of what credential it presented --
  // discovered while verifying #47 end-to-end.
  //
  // `/status/*` is also excluded from the redirect-to-login check below --
  // belt-and-suspenders alongside the early return above, in case this
  // pattern is ever loosened to cover paths other than exactly
  // `/status/[id]` (e.g. a future `/status` index route).
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/docs") &&
    !request.nextUrl.pathname.startsWith("/status")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
