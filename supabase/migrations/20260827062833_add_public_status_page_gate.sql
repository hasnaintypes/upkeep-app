-- Public status page gate (PRD §5.6, Phase 8, #51 follow-up): a cheap true/false check for
-- src/proxy.ts (Next.js middleware) to decide allow-vs-404 for /status/[id], separate from
-- get_public_project_status() (see the add_public_status_pages migration).
--
-- Why this can't just reuse get_public_project_status(): that function computes a full
-- 24h/7d/30d/90d uptime aggregation (several CTEs over checks/checks_aggregated) -- fine to run
-- once per page load, but middleware (src/proxy.ts) runs on *every* request matching its
-- config.matcher, including every /status/[id] hit from a crawler or repeated visitor. Gating on
-- the full aggregation there would mean paying for it twice per real page view (once in
-- middleware just to decide allow/404, once again in the page component to actually render the
-- data) for no benefit, since the middleware never uses the aggregate result itself.
--
-- Why the gate has to live in middleware at all, not just the page component: Next.js's own
-- notFound() docs are explicit that with Cache Components enabled, every dynamic route streams
-- its shell with a 200 status before any page-level data-dependent notFound() can run, so the
-- HTTP status can never actually become 404 from inside the page -- "run that check in proxy
-- instead" (https://nextjs.org/docs/app/api-reference/functions/not-found). Confirmed live: a
-- build with the check only in the page component served a cached/streamed 200 for a private
-- project in production (`next start`), even though `next dev` misleadingly showed 404 (dev mode
-- always renders fresh per-request, masking the bug) and even with `connection()` forcing
-- per-request rendering of the page itself. Middleware runs before any rendering/streaming
-- begins, so it's the only layer that can set a genuine 404 for this per-request, data-dependent
-- decision. The page component's own notFound() call (see src/app/status/[id]/page.tsx) stays in
-- place as defense-in-depth for the narrow window between this gate and the page's own fetch, not
-- as the primary mechanism.
create or replace function public.is_project_publicly_visible(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects where id = p_project_id and is_public = true
  );
$$;

comment on function public.is_project_publicly_visible(uuid) is 'Cheap true/false gate for whether /status/[id] (#51) should be allowed to render at all -- called from src/proxy.ts middleware on every request, before any page rendering begins, so it can actually set a 404 status (unlike a page-level notFound() under Cache Components -- see this migration''s own top comment). security definer -- checks is_public itself, mirroring get_public_project_status()''s own gating.';

revoke all on function public.is_project_publicly_visible(uuid) from public;
grant execute on function public.is_project_publicly_visible(uuid) to anon, authenticated;
