-- Create project_notification_rules table (PRD §6) with owner-scoped RLS via the owning project.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md). Consumed later by Phase 6
-- (alerting).

create table public.project_notification_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Documented FK cascade choice: a notification rule has no meaning without its channel, so
  -- deleting a channel removes any rules referencing it (cascade) rather than blocking the
  -- channel delete (restrict) or leaving an orphaned rule row behind.
  channel_id uuid not null references public.notification_channels (id) on delete cascade,
  escalation_threshold integer not null default 1,
  digest_only boolean not null default false,
  constraint project_notification_rules_escalation_threshold_positive check (
    escalation_threshold > 0
  ),
  -- Prevents ambiguous duplicate rules wiring the same channel to the same project more than
  -- once (addition beyond the literal PRD ask, for data integrity).
  constraint project_notification_rules_project_channel_unique unique (project_id, channel_id)
);

comment on table public.project_notification_rules is 'Per-project alert rules linking a project to a notification channel (PRD §6).';

-- project_id is already covered as the leading column of the unique constraint's index above;
-- channel_id still needs its own index for FK/cascade-delete performance (Postgres does not
-- auto-index FK columns).
create index project_notification_rules_channel_id_idx
  on public.project_notification_rules (channel_id);

alter table public.project_notification_rules enable row level security;

create policy "project_notification_rules_select_own" on public.project_notification_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = project_notification_rules.project_id
        and projects.user_id = (select auth.uid())
    )
  );

-- Insert/update must verify ownership of *both* the project and the channel being attached, so a
-- user can't wire another user's private notification channel into their own project's rule.
create policy "project_notification_rules_insert_own" on public.project_notification_rules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects
      where projects.id = project_notification_rules.project_id
        and projects.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.notification_channels
      where notification_channels.id = project_notification_rules.channel_id
        and notification_channels.user_id = (select auth.uid())
    )
  );

create policy "project_notification_rules_update_own" on public.project_notification_rules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = project_notification_rules.project_id
        and projects.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.projects
      where projects.id = project_notification_rules.project_id
        and projects.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.notification_channels
      where notification_channels.id = project_notification_rules.channel_id
        and notification_channels.user_id = (select auth.uid())
    )
  );

create policy "project_notification_rules_delete_own" on public.project_notification_rules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = project_notification_rules.project_id
        and projects.user_id = (select auth.uid())
    )
  );
