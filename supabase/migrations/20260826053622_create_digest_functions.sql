-- Digest mode data functions (PRD §5.5, Phase 6, issue #46), consumed by
-- the `digest` Edge Function's scheduled runs (see schedule_digest_cron).
--
-- Both functions are service_role-only, unlike get_project_uptime_summary/
-- get_project_daily_history (#29/#31, authenticated-only, security invoker
-- relying on the caller's own RLS via auth.uid()). The digest job runs
-- unattended across *every* user's data in one invocation -- there is no
-- signed-in caller/auth.uid() for it to be scoped by -- so these are
-- deliberately:
--   1. `security invoker` (the default, same as get_due_projects, #20) --
--      the digest Edge Function's service_role client already bypasses RLS
--      by role, not by function privilege escalation, so there's no reason
--      for these to run as definer.
--   2. Explicitly parameterized (p_user_id/p_frequency) and filtered in the
--      function body itself, never relying on RLS/auth.uid() to scope rows
--      -- auth.uid() is null under a service-role call anyway, and
--      get_project_uptime_summary's own RLS-only scoping would be unsafe
--      to reuse as-is from a service-role caller (it would return every
--      user's every project in one call, see #46's own PR discussion).
--   3. Granted to `service_role` only, explicitly revoked from
--      `public`/`anon`/`authenticated` -- get_user_portfolio_summary takes
--      an arbitrary `p_user_id` with no ownership check of its own (by
--      design, so the digest job can iterate every recipient), so granting
--      it to `authenticated` would let any signed-in user read any other
--      user's portfolio by simply passing their id. This grant boundary is
--      the only thing standing between "explicit parameter" and "the same
--      leak the RLS policies on every other table exist to prevent" -- do
--      not widen it without re-deriving this comment's reasoning.

-- Distinct (user, destination email) pairs that should receive a digest at
-- the given cadence. Joins project_notification_rules -> projects (for the
-- owning user_id) -> notification_channels (for the destination address) --
-- deliberately not through notification_channels.user_id, since RLS
-- already guarantees the two are always the same user for any real row
-- (project_notification_rules_insert_own/_update_own's own `with check`
-- requires both to match, see that migration's comments); asserting it
-- again via a second join would be redundant, not safer.
create or replace function public.get_digest_recipients(p_frequency text)
returns table (
  user_id uuid,
  to_email text
)
language sql
stable
set search_path = ''
as $$
  select distinct p.user_id, nc.config ->> 'to' as to_email
  from public.project_notification_rules pnr
  join public.projects p on p.id = pnr.project_id
  join public.notification_channels nc on nc.id = pnr.channel_id
  where pnr.digest_only = true
    and pnr.digest_frequency = p_frequency
    and nc.type = 'email'
    and nc.is_active = true
    and nc.config ->> 'to' is not null;
$$;

comment on function public.get_digest_recipients(text) is 'Distinct (user_id, to_email) pairs with a digest_only rule at the given cadence (#46). service_role only -- see this migration''s own top comment.';

revoke all on function public.get_digest_recipients(text) from public, anon, authenticated;
grant execute on function public.get_digest_recipients(text) to service_role;

-- One user's whole portfolio for the digest period -- every active project
-- they own (not just ones with a digest_only rule attached, per #46's own
-- "portfolio-level, not one email per project" acceptance criterion),
-- each with its latest status, uptime % over the period, and incident
-- count over the period. Same aggregated-with-raw-fallback uptime logic as
-- get_project_uptime_summary (#29) -- see that function's own comment for
-- the full reasoning -- collapsed to a single caller-supplied window
-- instead of four fixed ones, since a digest has exactly one period
-- (the cadence's own length) to report on, not a dashboard's multi-window
-- comparison.
create or replace function public.get_user_portfolio_summary(p_user_id uuid, p_period_hours integer)
returns table (
  project_id uuid,
  project_name text,
  last_status text,
  last_checked_at timestamptz,
  uptime_percentage numeric,
  incident_count integer
)
language sql
stable
set search_path = ''
as $$
  with user_projects as (
    select id, name
    from public.projects
    where user_id = p_user_id and is_active = true
  ),
  period as (
    select now() - (p_period_hours || ' hours')::interval as win_start
  ),
  latest_check as (
    select p.id as project_id, lc.status, lc.checked_at
    from user_projects p
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
      ca.project_id,
      max(
        ca.period_start + case when ca.period_type = 'hourly' then interval '1 hour' else interval '1 day' end
      ) as covered_until
    from public.checks_aggregated ca
    where ca.project_id in (select id from user_projects)
    group by ca.project_id
  ),
  agg_counts as (
    select ca.project_id, sum(ca.total_checks) as total_checks, sum(ca.total_failures) as total_failures
    from public.checks_aggregated ca, period pr
    where ca.project_id in (select id from user_projects)
      and ca.period_start >= pr.win_start
    group by ca.project_id
  ),
  raw_counts as (
    select
      p.id as project_id,
      count(c.*) as raw_total,
      count(*) filter (where c.status != 'up') as raw_failures
    from user_projects p
    cross join period pr
    left join coverage cov on cov.project_id = p.id
    left join public.checks c
      on c.project_id = p.id
      and c.checked_at >= greatest(pr.win_start, coalesce(cov.covered_until, pr.win_start))
    group by p.id
  ),
  incident_counts as (
    select i.project_id, count(*)::integer as incident_count
    from public.incidents i, period pr
    where i.project_id in (select id from user_projects)
      and i.started_at >= pr.win_start
    group by i.project_id
  )
  select
    up.id as project_id,
    up.name as project_name,
    lc.status as last_status,
    lc.checked_at as last_checked_at,
    case
      when (coalesce(ac.total_checks, 0) + coalesce(rc.raw_total, 0)) = 0 then null
      else round(
        100.0 * (1 - (coalesce(ac.total_failures, 0) + coalesce(rc.raw_failures, 0))::numeric
          / (coalesce(ac.total_checks, 0) + coalesce(rc.raw_total, 0))),
        2
      )
    end as uptime_percentage,
    coalesce(ic.incident_count, 0) as incident_count
  from user_projects up
  left join latest_check lc on lc.project_id = up.id
  left join agg_counts ac on ac.project_id = up.id
  left join raw_counts rc on rc.project_id = up.id
  left join incident_counts ic on ic.project_id = up.id
  order by up.name;
$$;

comment on function public.get_user_portfolio_summary(uuid, integer) is 'One user''s active projects with status/uptime%/incident count over the given period, for the digest email (#46). service_role only, explicit p_user_id (no auth.uid()) -- see this migration''s own top comment.';

revoke all on function public.get_user_portfolio_summary(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_user_portfolio_summary(uuid, integer) to service_role;
