-- Per-project uptime heatmap/timeline data (PRD §5.6, Phase 4, issue #31): one row per calendar
-- day for the last N days (default 90, matching the issue's minimum), each carrying that day's
-- aggregate uptime %, check count, and failure count -- exactly what a status-page.io-style
-- day-by-day bar needs to color and label itself.
--
-- Same aggregated-preferred/raw-fallback hybrid as get_project_uptime_summary (#29) and
-- getResponseTimeSeries's 30d/90d path (#30), adapted to per-day granularity instead of a rolling
-- window: `checks_aggregated` is still schema-only pending the Phase 10 rollup job (see that
-- table's own comment), so every day falls back to raw `checks` today, but the logic is written
-- against the eventual contract:
--   1. If a daily `checks_aggregated` row exists for a given day, its uptime_percentage/
--      total_checks/total_failures/avg_response_time_ms are used directly (no re-scanning raw
--      checks for an already-rolled-up day).
--   2. Otherwise, the day's stats are computed from raw `checks` for that calendar date --
--      `not exists` against the aggregated rows means this GROUP BY only ever runs over days that
--      genuinely lack a rollup, not the whole 90-day range every time.
--   3. A day with zero checks either way (project didn't exist yet, or a gap in monitoring) comes
--      back with null uptime_percentage/avg_response_time_ms and source = 'none' -- the heatmap
--      renders this as a neutral/empty cell, not an error (per the issue's acceptance criteria).
-- "Failure" is `status != 'up'` for the raw fallback, same definition as get_project_uptime_summary
-- -- Phase 10's rollup job must use the same definition when computing total_failures, or mixing
-- aggregated and raw days in one timeline would read inconsistently.
--
-- security invoker (the default): scoped entirely by the caller's own RLS on
-- `checks`/`checks_aggregated`, same reasoning as get_project_uptime_summary.
create or replace function public.get_project_daily_history(
  p_project_id uuid,
  p_days integer default 90
)
returns table (
  day date,
  uptime_percentage numeric,
  total_checks integer,
  total_failures integer,
  avg_response_time_ms numeric,
  source text
)
language sql
stable
set search_path = ''
as $$
  with days as (
    select generate_series(
      current_date - (p_days - 1),
      current_date,
      interval '1 day'
    )::date as day
  ),
  agg as (
    select
      period_start::date as day,
      uptime_percentage,
      total_checks,
      total_failures,
      avg_response_time_ms::numeric as avg_response_time_ms
    from public.checks_aggregated
    where project_id = p_project_id
      and period_type = 'daily'
  ),
  raw_days as (
    select
      date_trunc('day', c.checked_at)::date as day,
      count(*)::integer as total_checks,
      count(*) filter (where c.status != 'up')::integer as total_failures,
      round(avg(c.response_time_ms)) as avg_response_time_ms
    from public.checks c
    where c.project_id = p_project_id
      and c.checked_at >= current_date - (p_days - 1)
      and not exists (
        select 1 from agg a where a.day = date_trunc('day', c.checked_at)::date
      )
    group by 1
  )
  select
    d.day,
    coalesce(
      a.uptime_percentage,
      case
        when r.total_checks > 0
          then round(100.0 * (1 - r.total_failures::numeric / r.total_checks), 2)
        else null
      end
    ) as uptime_percentage,
    coalesce(a.total_checks, r.total_checks, 0) as total_checks,
    coalesce(a.total_failures, r.total_failures, 0) as total_failures,
    coalesce(a.avg_response_time_ms, r.avg_response_time_ms) as avg_response_time_ms,
    case
      when a.day is not null then 'aggregated'
      when r.total_checks > 0 then 'raw'
      else 'none'
    end as source
  from days d
  left join agg a on a.day = d.day
  left join raw_days r on r.day = d.day
  order by d.day;
$$;

comment on function public.get_project_daily_history(uuid, integer) is 'Per-day uptime %/checks/failures for one project''s last N days (#31 heatmap). security invoker -- scoped by the caller''s own RLS on checks/checks_aggregated.';

revoke all on function public.get_project_daily_history(uuid, integer) from public, anon;
grant execute on function public.get_project_daily_history(uuid, integer) to authenticated;
