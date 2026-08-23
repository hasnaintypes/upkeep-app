-- Manual "run check now" rate limiting (PRD §5.2/§3, Phase 3, issue #28).
--
-- `last_manual_check_at` + try_claim_manual_check() below is the per-project analog of
-- prober_lock / try_acquire_prober_lock() (see the schedule_prober_cron migration): an atomic
-- claimable UPDATE, not a check-then-set from application code, so two rapid clicks (or two
-- browser tabs) on the same project's "run check now" button can't both slip through the gap
-- between reading the last-run time and writing a new one.
--
-- Column lives on `projects` itself, not a separate table -- unlike prober_lock (one global
-- mutex row for the whole batch tick), this is inherently a per-project, per-owner value that
-- already belongs on the row it's throttling, and `projects_update_own` RLS already covers it
-- for free.
alter table public.projects add column last_manual_check_at timestamptz;

comment on column public.projects.last_manual_check_at is 'When this project''s "run check now" trigger last actually ran a check (#28), for per-project manual-trigger rate limiting. Distinct from a checks row''s checked_at -- this updates even if the manual check itself later fails to persist.';

-- security invoker (the default): runs as the calling (authenticated) role, so the UPDATE below
-- is still gated by projects_update_own RLS -- a caller can only ever claim a cooldown on a
-- project they own. No auth.uid() check is duplicated in the function body for that reason (same
-- reasoning as get_due_projects's own security-invoker comment, just via RLS here instead of
-- service_role).
create or replace function public.try_claim_manual_check(
  p_project_id uuid,
  p_cooldown_seconds integer default 30
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.projects
  set last_manual_check_at = now()
  where id = p_project_id
    and (
      last_manual_check_at is null
      or last_manual_check_at < now() - (p_cooldown_seconds || ' seconds')::interval
    );

  return found;
end;
$$;

comment on function public.try_claim_manual_check(uuid, integer) is 'Atomically claims a per-project manual-check cooldown (#28); returns false if the project does not exist/is not owned by the caller (filtered by RLS) or the cooldown has not elapsed yet.';

revoke all on function public.try_claim_manual_check(uuid, integer) from public, anon;
grant execute on function public.try_claim_manual_check(uuid, integer) to authenticated;
