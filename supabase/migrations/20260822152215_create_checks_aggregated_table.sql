-- Create checks_aggregated rollup table (PRD §6) with owner-scoped RLS via the owning project.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md). Schema only: populated later
-- by the Phase 10 rollup job.

create table public.checks_aggregated (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  period_start timestamptz not null,
  period_type text not null,
  uptime_percentage numeric not null,
  avg_response_time_ms integer not null,
  total_checks integer not null,
  total_failures integer not null,
  constraint checks_aggregated_period_type_valid check (
    period_type in ('hourly', 'daily')
  ),
  constraint checks_aggregated_uptime_percentage_valid check (
    uptime_percentage >= 0 and uptime_percentage <= 100
  ),
  constraint checks_aggregated_avg_response_time_ms_non_negative check (
    avg_response_time_ms >= 0
  ),
  constraint checks_aggregated_total_checks_non_negative check (total_checks >= 0),
  constraint checks_aggregated_total_failures_non_negative check (total_failures >= 0),
  constraint checks_aggregated_failures_le_total check (total_failures <= total_checks),
  -- Prevents duplicate rollups for the same project/period/granularity (acceptance criteria).
  -- Also serves as the FK/history-query index for this table (Postgres unique constraints
  -- cannot be backed by a DESC index, so this is plain ascending order).
  constraint checks_aggregated_project_period_unique unique (project_id, period_start, period_type)
);

comment on table public.checks_aggregated is 'Hourly/daily rollups of checks for long-term trend storage without unbounded raw check growth (PRD §6). Written by the Phase 10 rollup job via service_role.';

alter table public.checks_aggregated enable row level security;

-- Rollups are written server-side by the Phase 10 aggregation job via service_role (bypasses
-- RLS). Authenticated owners only ever read their own projects' rollups on the dashboard.
create policy "checks_aggregated_select_own" on public.checks_aggregated
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = checks_aggregated.project_id
        and projects.user_id = (select auth.uid())
    )
  );
