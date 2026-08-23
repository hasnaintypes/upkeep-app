-- Dashboard overview page data (PRD §5.6, Phase 4, issue #29): one query returning, per active
-- project owned by the caller, its latest check status/timestamp and rolling uptime % for the
-- 24h/7d/30d/90d windows the overview page needs.
--
-- Single RPC, not N+1 client-side queries -- with ~50 projects x 4 windows that would be 200
-- round trips. Everything here runs as one statement so the whole dashboard's data comes back in
-- one request, which is what the issue's "loads in under 1s" acceptance criteria actually needs.
--
-- security invoker (the default): runs as the calling (authenticated) role, so `projects`,
-- `checks`, and `checks_aggregated` are all read through their own existing RLS policies
-- (projects_select_own / checks_select_own / checks_aggregated_select_own) exactly as if the
-- caller had queried them directly -- this function adds no privilege of its own, it's purely a
-- server-side join/aggregation convenience. Same reasoning as get_due_projects's own
-- security-invoker comment, just enforced via RLS here instead of via service_role's bypass.
--
-- Aggregated-with-raw-fallback (per the issue's acceptance criteria): `checks_aggregated` is
-- schema-only right now (populated later by the Phase 10 rollup job -- see that table's own
-- comment), so today every window falls back to raw `checks` entirely. The logic below is written
-- against the *eventual* contract, not just today's empty table, so it needs no changes once
-- Phase 10 ships:
--   1. For each project, `covered_until` is the end of the most recently rolled-up period (its
--      latest period_start + that period's length) -- the boundary past which no aggregation
--      exists yet.
--   2. For each window, aggregated rows with period_start inside the window contribute their
--      precomputed total_checks/total_failures directly (no re-scanning raw checks for periods
--      already rolled up).
--   3. Raw `checks` only fill the remainder: from wherever is later of (the window's start) or
--      (covered_until) up to now -- i.e. exactly the stretch too recent to have been aggregated
--      yet. This avoids double-counting a period that's both aggregated and still physically
--      present in `checks` (retention/purging of rolled-up raw rows is a Phase 10 concern, not
--      assumed here).
--   4. A "failure" is any check with status != 'up' (waking/degraded/down/unknown all count
--      against uptime) -- Phase 10's rollup job must use this same definition when computing
--      `checks_aggregated.total_failures`, or blending the two sources here would understate or
--      overstate uptime %.
-- `windows`/`raw_window_counts` intentionally join on `project_id` (not just filter), so the
-- existing `checks_project_id_checked_at_idx (project_id, checked_at desc)` index serves every
-- window's raw-fallback scan directly -- no new index needed.
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

comment on function public.get_project_uptime_summary() is 'Per-active-project latest status + 24h/7d/30d/90d uptime % for the dashboard overview page (#29). security invoker -- scoped entirely by the caller''s own RLS on projects/checks/checks_aggregated.';

revoke all on function public.get_project_uptime_summary() from public, anon;
grant execute on function public.get_project_uptime_summary() to authenticated;
