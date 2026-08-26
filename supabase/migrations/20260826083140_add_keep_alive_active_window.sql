-- Configurable active window for keep-alive pings (PRD §5.8, Phase 7, issue #49).
--
-- Extends #48's get_due_keep_alive_projects() with an optional per-project window: pings only
-- fire while the current wall-clock time (evaluated in the project's own IANA time zone) falls
-- inside [keep_alive_window_start, keep_alive_window_end]. All three new columns are nullable and
-- must be all-null or all-set together (enforced below) -- null/unset means "always warm," the
-- explicit PRD §5.8 fallback ("or ping continuously if the goal is guaranteed always-warm state")
-- and issue #49's exit criterion that a project with no window configured keeps being pinged
-- continuously rather than silently skipped.
--
-- `keep_alive_window_start`/`_end` are a plain `time` (no attached zone, deliberately): the wall-
-- clock hours a user picks ("08:00-22:00") only mean something once paired with
-- `keep_alive_window_end` handles the overnight case (e.g. 22:00-06:00) by comparing the wrapped
-- range instead of a straight BETWEEN.
alter table public.projects
  add column keep_alive_window_start time,
  add column keep_alive_window_end time,
  add column keep_alive_timezone text;

comment on column public.projects.keep_alive_window_start is 'Start of the daily wall-clock window (in keep_alive_timezone) during which keep-alive pings fire (PRD §5.8, #49). Null (with the other two window columns) means "always warm" -- ping continuously.';
comment on column public.projects.keep_alive_window_end is 'End of the daily wall-clock window (in keep_alive_timezone) during which keep-alive pings fire (PRD §5.8, #49). May be earlier than keep_alive_window_start to express an overnight window (e.g. 22:00-06:00); see get_due_keep_alive_projects() for the wraparound handling.';
comment on column public.projects.keep_alive_timezone is 'IANA time zone name (e.g. "America/New_York") the active window''s start/end times are expressed in (PRD §5.8, #49). Validated against Postgres''s own time zone database by projects_keep_alive_timezone_valid below.';

-- Validates a time zone label the same way the scheduling query itself will use it (`AT TIME
-- ZONE`), rather than duplicating Postgres's time zone database in a lookup table: any label
-- Postgres itself would reject at query time is rejected here at write time instead, so
-- get_due_keep_alive_projects() below can never fail on a bad zone stored earlier. `stable`, not
-- `immutable`, since the set of recognized zone names is technically part of the server's tzdata,
-- not a pure function of the input in the strictest sense -- consistent with how Postgres itself
-- classifies AT TIME ZONE.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
stable
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_timezone(text) is 'True if tz is a time zone label Postgres''s AT TIME ZONE accepts (PRD §5.8, #49) -- used by projects_keep_alive_timezone_valid to validate keep_alive_timezone at write time.';

alter table public.projects
  add constraint projects_keep_alive_timezone_valid
    check (keep_alive_timezone is null or public.is_valid_timezone(keep_alive_timezone)),
  add constraint projects_keep_alive_window_all_or_nothing
    check (
      (keep_alive_window_start is null and keep_alive_window_end is null and keep_alive_timezone is null)
      or (keep_alive_window_start is not null and keep_alive_window_end is not null and keep_alive_timezone is not null)
    ),
  add constraint projects_keep_alive_window_not_zero_length
    check (keep_alive_window_start is null or keep_alive_window_start <> keep_alive_window_end);

-- Re-created (not altered) since Postgres has no ALTER FUNCTION ... ADD clause for a function
-- body -- same approach #48's own migration would have used had it needed to revise this
-- function. Adds one extra `and` clause to the #48 predicate; due-ness (keep_alive_enabled +
-- last_keep_alive_at cadence) is unchanged.
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
    )
    and (
      -- No window configured -- always warm (PRD §5.8's explicit fallback).
      keep_alive_window_start is null
      or (
        case
          -- Same-day window (e.g. 08:00-22:00): current local time falls between start and end.
          when keep_alive_window_start <= keep_alive_window_end then
            (now() at time zone keep_alive_timezone)::time
              between keep_alive_window_start and keep_alive_window_end
          -- Overnight window (e.g. 22:00-06:00): current local time is at/after start OR at/before end.
          else
            (now() at time zone keep_alive_timezone)::time >= keep_alive_window_start
            or (now() at time zone keep_alive_timezone)::time <= keep_alive_window_end
        end
      )
    );
$$;

comment on function public.get_due_keep_alive_projects() is 'Projects due for a keep-alive ping right now (PRD §5.8, #48/#49) -- keep_alive_enabled = true, on a fixed 10-minute cadence tracked via last_keep_alive_at, and (if configured) only inside the project''s own active window. service_role only -- see prober Edge Function''s keep-alive.ts.';

revoke all on function public.is_valid_timezone(text) from public, anon, authenticated;
grant execute on function public.is_valid_timezone(text) to authenticated;

revoke all on function public.get_due_keep_alive_projects() from public, anon, authenticated;
grant execute on function public.get_due_keep_alive_projects() to service_role;
