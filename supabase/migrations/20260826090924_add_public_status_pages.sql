-- Public status pages (PRD §5.6, Phase 8, issue #51): a project's owner can opt in to an
-- unauthenticated, read-only page showing that project's live status, uptime %, and recent
-- history -- the "link from a resume/portfolio site" use case.
--
-- Opt-in by default (`is_public` defaults to false): a project's health-check URL, response
-- times, and failure history aren't something a user should discover was exposed after the
-- fact -- matches this app's existing owner-only-by-default posture everywhere else (RLS, API
-- keys, notification config). #52 exposes this column as a toggle in the project settings UI;
-- this migration owns creating it since the public route below can't exist without it.
alter table public.projects
  add column is_public boolean not null default false;

comment on column public.projects.is_public is 'Opt-in flag for the unauthenticated /status/[id] public status page (#51). Owner-only write, gated read via the get_public_project_* functions below -- not exposed through the owner-only projects RLS policies, which stay unchanged.';

-- No RLS policy changes needed for `projects` itself: the existing owner-only select/insert/
-- update/delete policies (Phase 1) already cover this new column like any other -- the public,
-- unauthenticated read path below is intentionally *not* a `projects` RLS policy (that would
-- require exposing the whole row, including `health_url`/`headers`/`hosting_provider`, to widen
-- just for anon `select`). Instead every public read goes through one of three `security definer`
-- functions, each of which:
--   1. Re-checks `is_public = true` for the requested project_id itself (never trusts a caller-
--      supplied assumption that a project is public).
--   2. Returns only the specific safe columns the public status page actually needs -- never
--      `health_url`, `headers`, `hosting_provider`, `expected_body_match`, or any other
--      operationally-sensitive column.
--   3. Returns zero rows for a non-public or non-existent project id, indistinguishable from each
--      other -- the route layer (#51) turns that into a plain 404, never a 403 that would confirm
--      a private project's existence.
-- Granted to `anon` (and `authenticated`, so a signed-in visitor viewing someone else's public
-- page also works) -- explicitly revoked from `public` first, matching this codebase's existing
-- function-grant convention (see get_project_uptime_summary/get_project_daily_history).

-- Status + rolling uptime %, the public equivalent of get_project_uptime_summary (#29) but for
-- exactly one project_id, gated on is_public instead of RLS/auth.uid(). Same aggregated-with-
-- raw-fallback windowing logic (see that function's own comment for the full reasoning) --
-- duplicated rather than shared, since this one is security definer/single-project-scoped and
-- that one is security invoker/caller's-whole-portfolio-scoped, genuinely different privilege
-- shapes that shouldn't share a body.
create or replace function public.get_public_project_status(p_project_id uuid)
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
    where p.id = p_project_id and p.is_public = true
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
  group by t.id, t.name, t.description, lc.status, lc.checked_at;
$$;

comment on function public.get_public_project_status(uuid) is 'Public status + 24h/7d/30d/90d uptime % for one opted-in project (#51). security definer -- checks is_public itself, returns zero rows for a private/nonexistent project. Only safe columns (no health_url/headers/hosting_provider).';

revoke all on function public.get_public_project_status(uuid) from public;
grant execute on function public.get_public_project_status(uuid) to anon, authenticated;

-- Per-day uptime history, the public equivalent of get_project_daily_history (#31), gated on
-- is_public instead of RLS/auth.uid(). Identical windowing logic to that function (see its own
-- comment) -- duplicated for the same security-definer-vs-invoker reasoning as
-- get_public_project_status above.
create or replace function public.get_public_project_daily_history(
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
security definer
set search_path = ''
as $$
  with target as (
    select p.id
    from public.projects p
    where p.id = p_project_id and p.is_public = true
  ),
  days as (
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
    where project_id in (select id from target)
      and period_type = 'daily'
  ),
  raw_days as (
    select
      date_trunc('day', c.checked_at)::date as day,
      count(*)::integer as total_checks,
      count(*) filter (where c.status != 'up')::integer as total_failures,
      round(avg(c.response_time_ms)) as avg_response_time_ms
    from public.checks c
    where c.project_id in (select id from target)
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
  where exists (select 1 from target)
  order by d.day;
$$;

comment on function public.get_public_project_daily_history(uuid, integer) is 'Public per-day uptime history for one opted-in project''s last N days (#51 heatmap). security definer -- checks is_public itself, returns zero rows for a private/nonexistent project.';

revoke all on function public.get_public_project_daily_history(uuid, integer) from public;
grant execute on function public.get_public_project_daily_history(uuid, integer) to anon, authenticated;

-- Recent raw checks (fixed 24h window, matching this page's "recent history" scope rather than
-- the authenticated dashboard's full 24h/7d/30d/90d switcher from #30 -- kept intentionally
-- narrower here per #51's own scope) for the public status page's response-time chart. Uses the
-- existing checks_project_id_checked_at_idx (project_id, checked_at desc) index -- no new index
-- needed.
create or replace function public.get_public_project_recent_checks(
  p_project_id uuid,
  p_hours integer default 24
)
returns table (
  checked_at timestamptz,
  status text,
  http_status integer,
  response_time_ms integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.checked_at, c.status, c.http_status, c.response_time_ms
  from public.checks c
  where c.project_id in (
      select p.id from public.projects p where p.id = p_project_id and p.is_public = true
    )
    and c.checked_at >= now() - (p_hours || ' hours')::interval
  order by c.checked_at asc;
$$;

comment on function public.get_public_project_recent_checks(uuid, integer) is 'Public recent (default 24h) raw checks for one opted-in project''s response-time chart (#51). security definer -- checks is_public itself, returns zero rows for a private/nonexistent project.';

revoke all on function public.get_public_project_recent_checks(uuid, integer) from public;
grant execute on function public.get_public_project_recent_checks(uuid, integer) to anon, authenticated;
