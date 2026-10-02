-- Platform Usage Budgets, part 2 (docs/ROADMAP.md Phase 12): a user-owned "platform account"
-- represents one real hosting account (e.g. "My Render Account"), so a shared free-tier pool
-- can be split correctly across every project attached to it -- grouping by platform alone
-- would incorrectly merge two separate real accounts on the same platform into one pool.
--
-- `quota_minutes_per_month` is copied from the chosen tier's preset at creation time (app-side,
-- not a DB default -- the tier's own number can be null) and is user-editable afterward, since
-- presets drift and some platforms (Railway, a custom VPS) have no preset at all.
-- `assumed_ms_per_request` converts a minutes/month budget into a check interval (see
-- src/features/projects/lib/platform-budget.ts) -- a deliberately simple, overridable estimate,
-- not a measurement.

create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  platform_id uuid not null references public.hosting_platforms (id),
  tier_id uuid not null references public.hosting_platform_tiers (id),
  quota_minutes_per_month integer,
  assumed_ms_per_request integer not null default 300,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_accounts_label_length check (char_length(label) between 1 and 100),
  constraint platform_accounts_quota_non_negative check (
    quota_minutes_per_month is null or quota_minutes_per_month >= 0
  ),
  constraint platform_accounts_assumed_ms_positive check (assumed_ms_per_request > 0)
);

comment on table public.platform_accounts is 'A user''s real hosting account on a platform (e.g. "My Render Account"), used to pool a shared free-tier budget across every project attached to it via projects.platform_account_id (docs/ROADMAP.md Phase 12).';
comment on column public.platform_accounts.quota_minutes_per_month is 'Total monthly compute-minutes budget for this account, shared across every attached project. Null means unlimited / not budget-tracked. Copied from the chosen tier''s preset at creation, editable afterward.';
comment on column public.platform_accounts.assumed_ms_per_request is 'Estimated compute time a single health check/keep-alive ping costs on this account''s platform -- the one knob that converts a minutes/month budget into a check interval. Not measured; adjust if real-world usage diverges.';

create index platform_accounts_user_id_idx on public.platform_accounts (user_id);

create trigger set_platform_accounts_updated_at
before update on public.platform_accounts
for each row
execute function public.set_updated_at();

alter table public.platform_accounts enable row level security;

create policy "platform_accounts_select_own" on public.platform_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "platform_accounts_insert_own" on public.platform_accounts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "platform_accounts_update_own" on public.platform_accounts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "platform_accounts_delete_own" on public.platform_accounts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
