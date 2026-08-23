-- Efficient "which projects are due for a check right now" lookup for the prober
-- Edge Function (PRD §5.2, Phase 3, issue #20).
--
-- Design: a single query using a LATERAL join against `checks` to get each
-- project's most recent check, backed by the existing
-- checks_project_id_checked_at_idx index (#6) -- not a maintained
-- `last_checked_at` column on `projects`. A denormalized column would need to
-- be kept in sync by whatever eventually writes check results, introducing a
-- new way for "due" state to silently drift from reality if that write ever
-- fails independently of the check itself; a live join against the
-- already-authoritative `checks` table has no such failure mode and is still
-- a single indexed query, not N+1, at this project's scale (~50 projects).
--
-- Exposed as a SQL function (not a view) so it can be locked down with
-- explicit GRANTs: only `service_role` (the prober, via the service-role
-- client) may call it. `security invoker` (the default) is correct here --
-- the prober already bypasses RLS via its role, not via function privilege
-- escalation, so there's no reason for this to run as a definer.
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
    );
$$;

comment on function public.get_due_projects() is 'Active projects due for a health check now, per their own check_interval_seconds (PRD §5.2). service_role only -- see prober Edge Function.';

revoke all on function public.get_due_projects() from public, anon, authenticated;
grant execute on function public.get_due_projects() to service_role;
