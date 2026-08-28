-- Fixes a double-counting bug in `get_project_uptime_summary` (#29),
-- found while verifying #65 (raw/aggregated blending across the 7-day
-- retention boundary, #63). The bug predates #62's rollup job existing --
-- it's not a pruning bug -- but only became observable once
-- `checks_aggregated` actually started accumulating both hourly and daily
-- rows for the same days.
--
-- Root cause: the original `agg` lateral summed every `checks_aggregated`
-- row with `period_start >= win_start`, with no `period_type` filter.
-- `rollup_daily_checks` (create_rollup_functions migration) derives a
-- day's daily row *from* that day's 24 hourly rows without ever deleting
-- them -- so once a day has both (every day older than "yesterday", in
-- steady state), that day's checks/failures got summed twice: once via
-- its 24 hourly rows, once via its 1 daily row. This skewed every
-- window's uptime % (7d/30d/90d; 24h is usually too recent to have a
-- settled daily row yet) away from the true weighted average, not just by
-- a uniform scaling factor -- "today" (no daily row yet) wasn't doubled,
-- so the doubled older days got roughly 2x the statistical weight of the
-- undoubled recent sliver.
--
-- Fix: for each `checks_aggregated` row being summed, include it if
--   (a) it's a daily row, or
--   (b) it's an hourly row whose day does NOT yet have a daily row
--       *within this same window* (i.e. `not exists` a same-day daily row
--       with its own `period_start >= w.win_start`).
-- The "within this same window" qualifier on the `not exists` (not just
-- "does a daily row exist anywhere") matters at the window's own start
-- boundary: a window starting mid-day (e.g. `now() - 7 days` landing at
-- 2am) must still count that partial boundary day's *hourly* rows from
-- 2am onward, even though a daily row for that whole day exists in the
-- table (its own `period_start` is midnight, before `win_start`, so it's
-- correctly excluded from the sum on its own merits) -- without this
-- qualifier, those legitimate in-window hourly rows would be wrongly
-- suppressed by a daily row that isn't even part of this window's sum,
-- undercounting the boundary day instead of fixing the double-count.
--
-- `get_project_daily_history` (#31) already filters `period_type =
-- 'daily'` explicitly and has no equivalent bug -- this migration brings
-- `get_project_uptime_summary` in line with that function's own already-
-- correct convention, just adapted for a sliding-window sum instead of a
-- per-calendar-day series.
--
-- Note (flagged, not fixed here -- out of scope for #65's dashboard-graph
-- verification): the identical missing-`period_type`-filter pattern also
-- exists in `get_user_portfolio_summary` (create_digest_functions
-- migration, digest email uptime %) and in the public-status-page uptime
-- % queries (add_public_status_pages/add_public_portfolio_status
-- migrations) -- all three were copied from this function's own CTE
-- shape and inherit the same double-counting bug. Worth a follow-up issue
-- since it affects every consumer of that pattern, not just the
-- dashboard's overview table.
create or replace function public.get_project_uptime_summary()
returns table (
  project_id uuid,
  last_status text,
  last_checked_at timestamptz,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric,
  uptime_90d numeric
)
language sql
stable
set search_path = ''
as $$
  with active_projects as (
    select id from public.projects where is_active = true
  ),
  latest_check as (
    select p.id as project_id, lc.status, lc.checked_at
    from active_projects p
    left join lateral (
      select c.status, c.checked_at
      from public.checks c
      where c.project_id = p.id
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
      p.id as project_id,
      w.win_label,
      coalesce(agg.total_checks, 0) as agg_total,
      coalesce(agg.total_failures, 0) as agg_failures,
      greatest(w.win_start, coalesce(cov.covered_until, w.win_start)) as raw_from
    from active_projects p
    cross join windows w
    left join coverage cov on cov.project_id = p.id
    left join lateral (
      select
        sum(ca.total_checks) as total_checks,
        sum(ca.total_failures) as total_failures
      from public.checks_aggregated ca
      where ca.project_id = p.id
        and ca.period_start >= w.win_start
        and (
          ca.period_type = 'daily'
          or not exists (
            select 1
            from public.checks_aggregated d
            where d.project_id = ca.project_id
              and d.period_type = 'daily'
              and d.period_start = date_trunc('day', ca.period_start)
              and d.period_start >= w.win_start
          )
        )
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
    lc.project_id,
    lc.status as last_status,
    lc.checked_at as last_checked_at,
    max(c.uptime_pct) filter (where c.win_label = '24h') as uptime_24h,
    max(c.uptime_pct) filter (where c.win_label = '7d') as uptime_7d,
    max(c.uptime_pct) filter (where c.win_label = '30d') as uptime_30d,
    max(c.uptime_pct) filter (where c.win_label = '90d') as uptime_90d
  from latest_check lc
  left join combined c on c.project_id = lc.project_id
  group by lc.project_id, lc.status, lc.checked_at;
$$;

comment on function public.get_project_uptime_summary() is 'Per-active-project latest status + 24h/7d/30d/90d uptime % (#29), blending checks_aggregated (deduped hourly-vs-daily, #65) with a raw checks tail for whatever is newer than the latest aggregated period. authenticated only, security invoker (RLS-scoped via projects/checks/checks_aggregated policies).';
