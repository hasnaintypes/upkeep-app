-- Create checks table (PRD §6) with owner-scoped RLS via the owning project.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md).

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null,
  http_status integer,
  response_time_ms integer,
  error_message text,
  response_snippet text,
  region text,
  checked_at timestamptz not null default now(),
  constraint checks_status_valid check (
    status in ('up', 'down', 'degraded', 'waking', 'unknown')
  ),
  constraint checks_http_status_valid check (
    http_status is null or http_status between 100 and 599
  ),
  constraint checks_response_time_ms_non_negative check (
    response_time_ms is null or response_time_ms >= 0
  )
);

comment on table public.checks is 'Append-only health check results per project (PRD §6). Written by the prober via service_role.';

-- Covers both the FK (project_id prefix) and the dashboard's "latest checks for project" query pattern.
create index checks_project_id_checked_at_idx
  on public.checks (project_id, checked_at desc);

alter table public.checks enable row level security;

-- checks is append-only and written server-side by the prober via service_role (bypasses RLS).
-- Authenticated users only ever read their own projects' checks; no insert/update/delete policy
-- is defined, so those operations are denied by default for anon/authenticated.
create policy "checks_select_own" on public.checks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = checks.project_id
        and projects.user_id = (select auth.uid())
    )
  );
