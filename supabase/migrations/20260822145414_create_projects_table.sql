-- Create projects table (PRD §6) with owner-scoped RLS.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text,
  health_url text not null,
  method text not null default 'GET',
  expected_status integer not null default 200,
  expected_body_match text,
  headers jsonb,
  check_interval_seconds integer not null default 300,
  timeout_ms integer not null default 10000,
  retry_count integer not null default 1,
  hosting_provider text,
  tags text[],
  is_active boolean not null default true,
  keep_alive_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_check_interval_seconds_positive check (check_interval_seconds > 0),
  constraint projects_timeout_ms_positive check (timeout_ms > 0),
  constraint projects_retry_count_non_negative check (retry_count >= 0)
);

comment on table public.projects is 'Registered projects a user wants health-checked / kept alive (PRD §6).';

-- Foreign key + RLS predicate column both benefit from an index (Supabase RLS perf guidance).
create index projects_user_id_idx on public.projects (user_id);

-- Generic updated_at helper, reusable by future tables that need the same behavior.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "projects_insert_own" on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "projects_update_own" on public.projects
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "projects_delete_own" on public.projects
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
