-- Rate-limiting/backoff for the prober (PRD §5.2, Phase 9, issue #61): so
-- Upkeep's own polling traffic doesn't keep hammering a host that's already
-- telling it to slow down (HTTP 429), and so that back-off period isn't
-- itself misread as a real outage.
--
-- `rate_limit_backoff_until`/`rate_limit_backoff_count` live on `projects`,
-- same precedent as `last_manual_check_at` (see add_manual_check_rate_limit
-- migration) -- per-project runtime state that belongs on the row it's
-- throttling. `get_due_projects()` below excludes a project while its
-- backoff window hasn't elapsed yet; the prober (rate-limit.ts) is what
-- actually sets/clears these two columns after classifying each round's
-- result, not this migration.
alter table public.projects add column rate_limit_backoff_until timestamptz;
alter table public.projects add column rate_limit_backoff_count integer not null default 0;
alter table public.projects add constraint projects_rate_limit_backoff_count_valid check (rate_limit_backoff_count >= 0);

comment on column public.projects.rate_limit_backoff_until is 'Set by the prober (rate-limit.ts, #61) when this project''s host responds with HTTP 429 -- get_due_projects() excludes it until this timestamp elapses. Null means "not currently backed off".';
comment on column public.projects.rate_limit_backoff_count is 'Consecutive rate-limit (429) events, used to grow rate_limit_backoff_until exponentially (#61). Reset to 0 the moment a check comes back without a 429.';

-- `is_rate_limited` marks the one `checks` row a 429 produces so
-- incidents.ts can exclude it from the escalation streak (#61's own
-- acceptance criterion: "not misclassified as down incidents purely
-- because of the backoff itself") -- mirrors is_consensus's existing role
-- of "written for visibility, but not eligible to open/resolve an
-- incident" (see add_multi_region_probing migration). `status` itself is
-- unchanged (still plain 'down') -- this is an additional flag, not a new
-- status value, so the existing checks_status_valid constraint and every
-- uptime-% function that reads `status` are untouched.
alter table public.checks add column is_rate_limited boolean not null default false;

comment on column public.checks.is_rate_limited is 'True only for a check that received HTTP 429 (#61). Excluded from incidents.ts''s escalation-streak query so Upkeep''s own rate-limit backoff can never masquerade as a real outage. Not currently excluded from uptime-% calculations -- known limitation, see issue #61''s implementation notes.';

-- Same function as create_get_due_projects_function, plus the backoff
-- exclusion -- see that migration's own comment for the rest of the
-- reasoning (LATERAL join against `checks`, security invoker, etc.), all
-- unchanged here.
create or replace function public.get_due_projects()
returns setof public.projects
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.projects p
  left join lateral (
    select c.checked_at
    from public.checks c
    where c.project_id = p.id
    order by c.checked_at desc
    limit 1
  ) latest_check on true
  where p.is_active = true
    and (
      latest_check.checked_at is null
      or latest_check.checked_at <= now() - (p.check_interval_seconds || ' seconds')::interval
    )
    and (
      p.rate_limit_backoff_until is null
      or p.rate_limit_backoff_until <= now()
    );
$$;

comment on function public.get_due_projects() is 'Active projects due for a health check now, per their own check_interval_seconds (PRD §5.2), excluding any project currently backed off from a rate-limit response (#61). service_role only -- see prober Edge Function.';
