-- Keep-alive ping scheduling (PRD §5.8, Phase 7, issue #48) -- decoupled entirely from
-- monitoring scheduling (get_due_projects(), #20): a project qualifies for a keep-alive ping
-- purely off `keep_alive_enabled = true`, regardless of `is_active`, on its own fixed cadence.
--
-- Cadence: fixed at 10 minutes (docs/ROADMAP.md's Phase 7 readiness checklist already decided
-- "fixed-schedule for v1" over a learned/adaptive idle-timeout, per PRD §10's open question) --
-- comfortably under common free-tier idle-spin-down windows (e.g. Render's free tier spins down
-- after ~15 minutes of inactivity) with margin for prober tick jitter. This is a single global
-- constant for v1, not a per-project column -- PRD §5.8's per-host-tuned interval and
-- configurable active window are separate, not-yet-built Phase 7 tasks; revisit this as a
-- per-project `keep_alive_interval_seconds` column if/when that's tackled, rather than widening
-- scope here. To change the interval, edit the literal below and ship a new migration -- there
-- is deliberately no settings table for a single constant only this function reads.
--
-- Due-ness needs its own tracking column (`last_keep_alive_at`), unlike get_due_projects()'s
-- live LATERAL join against `checks`: a keep-alive ping's whole point (PRD §5.8) is that it is
-- NOT a monitoring signal, so it must never write a `checks` row (see the prober Edge Function's
-- keep-alive.ts module comment for why) -- there is no other table whose data this could
-- authoritatively derive from instead.
alter table public.projects
  add column last_keep_alive_at timestamptz;

comment on column public.projects.last_keep_alive_at is 'When this project was last sent a keep-alive ping (PRD §5.8, #48) -- maintained by the prober Edge Function, independent of checks.checked_at. Null until the first keep-alive ping fires (or if keep_alive_enabled has never been true).';

create or replace function public.get_due_keep_alive_projects()
returns setof public.projects
language sql
stable
set search_path = ''
as $$
  select *
  from public.projects
  where keep_alive_enabled = true
    and (
      last_keep_alive_at is null
      or last_keep_alive_at <= now() - interval '10 minutes'
    );
$$;

comment on function public.get_due_keep_alive_projects() is 'Projects due for a keep-alive ping right now (PRD §5.8, #48) -- keep_alive_enabled = true only, independent of is_active/monitoring state, on a fixed 10-minute cadence tracked via last_keep_alive_at. service_role only -- see prober Edge Function''s keep-alive.ts.';

revoke all on function public.get_due_keep_alive_projects() from public, anon, authenticated;
grant execute on function public.get_due_keep_alive_projects() to service_role;
