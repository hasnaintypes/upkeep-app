-- Rollup functions for Phase 10 data retention/aggregation (PRD §5.3/§6,
-- ROADMAP Phase 10, issue #62): raw `checks` rows into hourly
-- `checks_aggregated` rows, then hourly rows into daily ones.
--
-- Aggregation done set-based in SQL (one INSERT ... SELECT ... GROUP BY per
-- call, not a per-project loop in the calling Edge Function) -- same
-- convention as get_project_uptime_summary/get_project_daily_history
-- (#29/#31): the correctness-critical math (uptime %, avg response time)
-- lives in one place, testable by hand against seeded rows via `pnpm
-- supabase db query --linked` (see AGENTS.md), not duplicated in TS.
--
-- "failure" = `status != 'up'` (waking/degraded/down/unknown all count
-- against uptime) -- must match get_project_uptime_summary/
-- get_project_daily_history's own definition exactly, or blending raw +
-- aggregated data across the retention boundary (future pruning task)
-- would understate/overstate uptime. Not further filtered by
-- `is_rate_limited` -- same known, disclosed gap as those two functions
-- (see add_rate_limit_backoff migration), not newly introduced here.
--
-- Idempotency (#62's own acceptance criteria: a second run for an
-- already-aggregated period must not double-count): both functions
-- `insert ... on conflict (project_id, period_start, period_type) do
-- update`, targeting checks_aggregated's own unique constraint -- rerunning
-- the same period recomputes and overwrites that period's row instead of
-- adding a second one. No separate overlap lock (unlike the prober's
-- `prober_lock` mutex) -- a duplicate concurrent run for the same period
-- just upserts the same row twice with the same values, which is
-- naturally idempotent, same reasoning as schedule_digest_cron's own "no
-- lock needed" note.
--
-- Both `security invoker` (the default) and revoked from
-- public/anon/authenticated, granted to service_role only -- same pattern
-- as create_digest_functions: the rollup Edge Function's service_role
-- client already bypasses RLS by role (checks_aggregated has no insert
-- policy at all, only a select policy for the owning user -- see
-- create_checks_aggregated_table migration), so there's no reason for
-- these to run as definer, and no other caller should ever invoke them.

-- Rolls up one UTC hour of `checks` rows (`[p_period_start,
-- p_period_start + 1 hour)`) into one `checks_aggregated` row per project
-- that had at least one consensus check in that window. Only
-- `is_consensus = true` rows count -- excludes the N raw per-region
-- diagnostic rows a multi-region-probing tick writes alongside its one
-- consensus row (see add_multi_region_probing migration), which would
-- otherwise inflate total_checks/total_failures and skew avg_response_time_ms
-- for a project probed from multiple regions.
--
-- Returns the number of project rows upserted, for the calling Edge
-- Function's own run summary (see rollup/rollup.ts).
create or replace function public.rollup_hourly_checks(p_period_start timestamptz)
returns integer
language sql
set search_path = ''
as $$
  with upserted as (
    insert into public.checks_aggregated (
      project_id,
      period_start,
      period_type,
      uptime_percentage,
      avg_response_time_ms,
      total_checks,
      total_failures
    )
    select
      c.project_id,
      p_period_start,
      'hourly',
      round(100.0 * count(*) filter (where c.status = 'up') / count(*), 2),
      coalesce(round(avg(c.response_time_ms) filter (where c.response_time_ms is not null)), 0)::integer,
      count(*)::integer,
      count(*) filter (where c.status != 'up')::integer
    from public.checks c
    where c.is_consensus = true
      and c.checked_at >= p_period_start
      and c.checked_at < p_period_start + interval '1 hour'
    group by c.project_id
    on conflict (project_id, period_start, period_type)
    do update set
      uptime_percentage = excluded.uptime_percentage,
      avg_response_time_ms = excluded.avg_response_time_ms,
      total_checks = excluded.total_checks,
      total_failures = excluded.total_failures
    returning 1
  )
  select count(*)::integer from upserted;
$$;

comment on function public.rollup_hourly_checks(timestamptz) is 'Rolls up raw checks in [p_period_start, p_period_start + 1h) into hourly checks_aggregated rows, one per project, upserted (#62). service_role only.';

revoke all on function public.rollup_hourly_checks(timestamptz) from public, anon, authenticated;
grant execute on function public.rollup_hourly_checks(timestamptz) to service_role;

-- Rolls up one UTC day of *hourly* `checks_aggregated` rows
-- (`[p_period_start, p_period_start + 1 day)`) into one daily row per
-- project. Derived from the hourly rows, not raw `checks` -- per #62's own
-- "daily rollups derived from hourly rows or raw data, documented either
-- way" acceptance criterion: this means a daily rollup only ever needs
-- that day's 24 hourly rows to already exist (see schedule_rollup_cron's
-- own comment on cron timing), not raw checks -- so once Phase 10's future
-- raw-check-pruning task ships, daily (and any re-run of daily) still work
-- with no dependency on raw retention window.
--
-- avg_response_time_ms is a *weighted* average across the day's hourly
-- rows (weighted by each hour's total_checks), not a plain average of
-- averages -- an hour with 60 checks and an hour with 6 checks shouldn't
-- count equally toward the day's average response time.
create or replace function public.rollup_daily_checks(p_period_start date)
returns integer
language sql
set search_path = ''
as $$
  with bounds as (
    -- Explicit `at time zone 'utc'`, not a bare `::timestamptz` cast --
    -- casting a `date` straight to `timestamptz` interprets it in the
    -- session's timezone, which would silently shift the window if this
    -- function is ever called from a session whose timezone isn't UTC.
    -- `period_start`/`checked_at` are always UTC instants everywhere else
    -- in this schema, so this window must be too.
    select
      (p_period_start::timestamp at time zone 'utc') as period_start_ts,
      ((p_period_start + 1)::timestamp at time zone 'utc') as period_end_ts
  ),
  hourly as (
    select
      ca.project_id,
      sum(ca.total_checks) as total_checks,
      sum(ca.total_failures) as total_failures,
      sum(ca.avg_response_time_ms::numeric * ca.total_checks) as weighted_response_time_sum
    from public.checks_aggregated ca, bounds
    where ca.period_type = 'hourly'
      and ca.period_start >= bounds.period_start_ts
      and ca.period_start < bounds.period_end_ts
    group by ca.project_id
    having sum(ca.total_checks) > 0
  ),
  upserted as (
    insert into public.checks_aggregated (
      project_id,
      period_start,
      period_type,
      uptime_percentage,
      avg_response_time_ms,
      total_checks,
      total_failures
    )
    select
      hourly.project_id,
      bounds.period_start_ts,
      'daily',
      round(100.0 * (hourly.total_checks - hourly.total_failures) / hourly.total_checks, 2),
      round(hourly.weighted_response_time_sum / hourly.total_checks)::integer,
      hourly.total_checks::integer,
      hourly.total_failures::integer
    from hourly, bounds
    on conflict (project_id, period_start, period_type)
    do update set
      uptime_percentage = excluded.uptime_percentage,
      avg_response_time_ms = excluded.avg_response_time_ms,
      total_checks = excluded.total_checks,
      total_failures = excluded.total_failures
    returning 1
  )
  select count(*)::integer from upserted;
$$;

comment on function public.rollup_daily_checks(date) is 'Rolls up hourly checks_aggregated rows in [p_period_start, p_period_start + 1 day) into daily rows, one per project, upserted (#62). service_role only.';

revoke all on function public.rollup_daily_checks(date) from public, anon, authenticated;
grant execute on function public.rollup_daily_checks(date) to service_role;
