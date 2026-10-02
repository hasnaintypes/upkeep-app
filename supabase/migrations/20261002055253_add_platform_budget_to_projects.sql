-- Platform Usage Budgets, part 3 (docs/ROADMAP.md Phase 12): attaches a project to a
-- platform_accounts row and records its minute allocation. All new columns are
-- nullable/defaulted so every pre-existing project is completely unaffected -- budgeting is
-- an opt-in alternative to typing check_interval_seconds manually, not a replacement for it.
--
-- `check_interval_seconds` and `keep_alive_interval_minutes` remain the only columns the
-- prober's scheduling functions ever read (see get_due_projects/get_due_keep_alive_projects) --
-- src/features/projects/lib/platform-budget.ts computes and writes them server-side whenever
-- a project's budget fields change, so no scheduling logic needs to know budgeting exists.

alter table public.projects
  add column platform_account_id uuid references public.platform_accounts (id) on delete set null,
  add column budget_minutes_per_month integer,
  add column keep_alive_budget_minutes_per_month integer,
  add column keep_alive_interval_minutes integer not null default 10;

comment on column public.projects.platform_account_id is 'Optional platform_accounts row this project draws its usage budget from (docs/ROADMAP.md Phase 12). Null means check_interval_seconds/keep_alive_interval_minutes are sized manually, same as before this feature existed. ON DELETE SET NULL: deleting the account detaches the project back to manual mode rather than deleting it.';
comment on column public.projects.budget_minutes_per_month is 'This project''s share of its platform_account''s monthly minute pool, allocated to monitoring checks. Drives the derived check_interval_seconds (see platform-budget.ts); meaningless without platform_account_id.';
comment on column public.projects.keep_alive_budget_minutes_per_month is 'Same as budget_minutes_per_month but for keep-alive pings; only meaningful when keep_alive_enabled. Drives the derived keep_alive_interval_minutes.';
comment on column public.projects.keep_alive_interval_minutes is 'Minutes between keep-alive pings (PRD §5.8). Defaults to 10 -- the fixed cadence every project used before this column existed -- and only changes from that default when a platform budget derives a different value. Read by get_due_keep_alive_projects() below.';

alter table public.projects
  add constraint projects_budget_requires_account check (
    platform_account_id is not null
    or (budget_minutes_per_month is null and keep_alive_budget_minutes_per_month is null)
  ),
  add constraint projects_budget_minutes_positive check (
    budget_minutes_per_month is null or budget_minutes_per_month > 0
  ),
  add constraint projects_keep_alive_budget_minutes_positive check (
    keep_alive_budget_minutes_per_month is null or keep_alive_budget_minutes_per_month > 0
  ),
  add constraint projects_keep_alive_interval_minutes_range check (
    keep_alive_interval_minutes between 1 and 1440
  );

-- Supports "sum every project's budget attached to account X" (platform account pool usage).
create index projects_platform_account_id_idx on public.projects (platform_account_id);

-- Re-created (not altered, per Postgres's own limitation -- same approach the
-- add_keep_alive_active_window migration used) to swap the hardcoded `interval '10 minutes'`
-- for the new per-project keep_alive_interval_minutes column. Every other predicate
-- (keep_alive_enabled, last_keep_alive_at null-or-elapsed, active window) is unchanged.
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
      or last_keep_alive_at <= now() - (keep_alive_interval_minutes || ' minutes')::interval
    )
    and (
      keep_alive_window_start is null
      or (
        case
          when keep_alive_window_start <= keep_alive_window_end then
            (now() at time zone keep_alive_timezone)::time
              between keep_alive_window_start and keep_alive_window_end
          else
            (now() at time zone keep_alive_timezone)::time >= keep_alive_window_start
            or (now() at time zone keep_alive_timezone)::time <= keep_alive_window_end
        end
      )
    );
$$;

comment on function public.get_due_keep_alive_projects() is 'Projects due for a keep-alive ping right now (PRD §5.8, #48/#49, Phase 12) -- keep_alive_enabled = true, on each project''s own keep_alive_interval_minutes cadence (default 10, the fixed value every project used before Phase 12) tracked via last_keep_alive_at, and (if configured) only inside the project''s own active window. service_role only -- see prober Edge Function''s keep-alive.ts.';

revoke all on function public.get_due_keep_alive_projects() from public, anon, authenticated;
grant execute on function public.get_due_keep_alive_projects() to service_role;
