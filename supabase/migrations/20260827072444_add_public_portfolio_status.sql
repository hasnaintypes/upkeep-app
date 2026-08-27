-- Aggregate public portfolio status page (PRD §5.6, Phase 8, issue #53): a single unauthenticated
-- page listing every currently-public project's status/uptime, linking out to each project's own
-- #51 page.
--
-- Single-owner-first scope, deliberately (per this issue's own instruction): this returns every
-- `is_public = true` project app-wide, not scoped to a specific user/portfolio id -- there is no
-- multi-tenant portfolio routing to build yet (Phase 1's RLS design is already single-owner-first,
-- and PRD §5.7 multi-user support hasn't shipped). Revisit this function (add a p_user_id/
-- p_portfolio_slug parameter) only if/when that actually happens, rather than building routing for
-- a feature that doesn't exist.
--
-- Same security-definer + only-safe-columns + is_public re-check pattern as #51's three
-- get_public_project_* functions (see the add_public_status_pages migration's own top comment for
-- the full reasoning) -- this one just returns every qualifying row instead of at most one.
-- Windowing logic (aggregated-rollup-with-raw-fallback) is identical to
-- get_public_project_status(), duplicated for the same reason that function's own comment gives:
-- security definer/portfolio-wide vs. security invoker/single-project scoped are genuinely
-- different privilege shapes that shouldn't share a body.
create or replace function public.get_public_projects_summary()
returns table (
  id uuid,
  name text,
  description text,
  last_status text,
  last_checked_at timestamptz,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric,
  uptime_90d numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select p.id, p.name, p.description
    from public.projects p
    where p.is_public = true
  ),
  latest_check as (
    select t.id as project_id, lc.status, lc.checked_at
    from target t
    left join lateral (
      select c.status, c.checked_at
      from public.checks c
      where c.project_id = t.id
      order by c.checked_at desc
      limit 1
    ) lc on true
  ),
  coverage as (
    select
      project_id,
      max(
        period_start + case when period_type = 'hourly' then interval '1 hour' else interval '1 day' end
      ) as covered_until
    from public.checks_aggregated
    where project_id in (select id from target)
    group by project_id
  ),
  windows (win_label, win_start) as (
    values
      ('24h', now() - interval '24 hours'),
      ('7d', now() - interval '7 days'),
      ('30d', now() - interval '30 days'),
      ('90d', now() - interval '90 days')
  ),
  per_window as (
    select
      t.id as project_id,
      w.win_label,
      coalesce(agg.total_checks, 0) as agg_total,
      coalesce(agg.total_failures, 0) as agg_failures,
      greatest(w.win_start, coalesce(cov.covered_until, w.win_start)) as raw_from
    from target t
    cross join windows w
    left join coverage cov on cov.project_id = t.id
    left join lateral (
      select
        sum(ca.total_checks) as total_checks,
        sum(ca.total_failures) as total_failures
      from public.checks_aggregated ca
      where ca.project_id = t.id
        and ca.period_start >= w.win_start
    ) agg on true
  ),
  raw_window_counts as (
    select
      pw.project_id,
      pw.win_label,
      pw.agg_total,
      pw.agg_failures,
      count(c.*) as raw_total,
      count(*) filter (where c.status != 'up') as raw_failures
    from per_window pw
    left join public.checks c
      on c.project_id = pw.project_id
      and c.checked_at >= pw.raw_from
    group by pw.project_id, pw.win_label, pw.agg_total, pw.agg_failures
  ),
  combined as (
    select
      project_id,
      win_label,
      case
        when (agg_total + raw_total) = 0 then null
        else round(
          100.0 * (1 - (agg_failures + raw_failures)::numeric / (agg_total + raw_total)),
          2
        )
      end as uptime_pct
    from raw_window_counts
  )
  select
    t.id,
    t.name,
    t.description,
    lc.status as last_status,
    lc.checked_at as last_checked_at,
    max(c.uptime_pct) filter (where c.win_label = '24h') as uptime_24h,
    max(c.uptime_pct) filter (where c.win_label = '7d') as uptime_7d,
    max(c.uptime_pct) filter (where c.win_label = '30d') as uptime_30d,
    max(c.uptime_pct) filter (where c.win_label = '90d') as uptime_90d
  from target t
  left join latest_check lc on lc.project_id = t.id
  left join combined c on c.project_id = t.id
  group by t.id, t.name, t.description, lc.status, lc.checked_at
  order by t.name;
$$;

comment on function public.get_public_projects_summary() is 'Every opted-in-public project''s status + 24h/7d/30d/90d uptime % for the aggregate portfolio status page (#53), ordered by name. security definer -- filters to is_public = true itself, returns only safe columns (no health_url/headers/hosting_provider). Single-owner-first scope: returns every public project app-wide, not scoped to a specific user -- see this migration''s own top comment.';

revoke all on function public.get_public_projects_summary() from public;
grant execute on function public.get_public_projects_summary() to anon, authenticated;
