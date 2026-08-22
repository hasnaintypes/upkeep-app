-- Create incidents table (PRD §6) with owner-scoped RLS via the owning project.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md).

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  cause text,
  notified boolean not null default false,
  constraint incidents_resolved_at_after_started_at check (
    resolved_at is null or resolved_at >= started_at
  )
);

comment on table public.incidents is 'Auto-detected incident records grouping consecutive failing checks per project (PRD §6).';

-- Covers both the FK (project_id prefix) and "incident history for project X, most recent first".
create index incidents_project_id_started_at_idx
  on public.incidents (project_id, started_at desc);

alter table public.incidents enable row level security;

-- Incidents are auto-detected server-side (prober/notifier via service_role, which bypasses RLS).
-- Authenticated owners can view their own incidents and manually annotate them (PRD §5.4 "add a
-- note to an incident"), but cannot insert or delete incident rows directly from the dashboard.
create policy "incidents_select_own" on public.incidents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = incidents.project_id
        and projects.user_id = (select auth.uid())
    )
  );

create policy "incidents_update_own" on public.incidents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = incidents.project_id
        and projects.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.projects
      where projects.id = incidents.project_id
        and projects.user_id = (select auth.uid())
    )
  );
