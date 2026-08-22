-- Create notification_channels table (PRD §6) with owner-scoped RLS.
-- Part of Phase 1 — Data Layer & Supabase Schema (docs/ROADMAP.md). Consumed later by Phase 6
-- (alerting).

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  config jsonb not null,
  is_active boolean not null default true,
  constraint notification_channels_type_valid check (
    type in ('discord', 'telegram', 'email', 'webhook')
  )
);

comment on table public.notification_channels is 'User-configured alert destinations (PRD §6), owned per user. user_id added for RLS ownership (PRD §5.7), not a literal PRD §6 column.';

-- Security note for the Phase 6 API layer: `config` holds secret-bearing values (webhook URLs,
-- bot tokens, etc.) per channel `type`. It must never be returned unmasked to the client after
-- creation — server code building the notification settings API should redact/omit secret fields
-- on read (e.g. return a masked placeholder) and only accept full values on write.
comment on column public.notification_channels.config is 'Channel-specific secrets/config (webhook URL, bot token, email address). SECURITY: never return unmasked to the client on read — the Phase 6 API layer must redact secret fields before serializing this column in any response.';

create index notification_channels_user_id_idx on public.notification_channels (user_id);

alter table public.notification_channels enable row level security;

create policy "notification_channels_select_own" on public.notification_channels
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notification_channels_insert_own" on public.notification_channels
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notification_channels_update_own" on public.notification_channels
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notification_channels_delete_own" on public.notification_channels
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
