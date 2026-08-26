-- Create api_keys table (PRD §5.7, #47) with owner-only RLS.
-- Part of Phase 6 -- Alerting & Notifications (docs/ROADMAP.md). Replaces the temporary
-- shared-secret stub auth on POST /api/projects/register (#19) with real per-user keys.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  key_hash text not null unique,
  key_prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint api_keys_label_not_blank check (btrim(label) <> '')
);

comment on table public.api_keys is 'Per-user API keys (PRD §5.7, #47) for programmatic project registration/health reporting (POST /api/projects/register, #19). The plaintext key is shown to the user exactly once at creation and never stored.';

comment on column public.api_keys.key_hash is 'SHA-256 hex digest of the full plaintext key. SECURITY: the plaintext key itself is never persisted anywhere -- this column is the only thing checked against, via an exact-match lookup on this unique index. A plain (unsalted) hash is safe here specifically because a key is 32 bytes of server-generated randomness, not a user-chosen password -- there is no dictionary/rainbow-table risk to defend against, and an indexed hash lookup is what lets verification stay O(1) instead of iterating every key with a slow per-row compare (the same approach GitHub/Stripe use for API keys).';

comment on column public.api_keys.key_prefix is 'First few characters of the plaintext key (e.g. "upk_a1b2c3d4"), stored unmasked. Not a secret on its own (nowhere near enough entropy to be usable for auth) -- shown in the management UI so a user can tell their keys apart without the full secret ever being re-displayed.';

comment on column public.api_keys.revoked_at is 'Null while the key is active. Set once and never cleared -- a revoked key cannot be un-revoked, only replaced by generating a new one.';

create index api_keys_user_id_idx on public.api_keys (user_id);

-- Supports the exact-match hash lookup verifyApiKey() does on every POST /api/projects/register
-- call. The unique constraint above already implies a unique index, but a duplicate `create index`
-- would fail -- the unique constraint's own index is what serves this lookup.

alter table public.api_keys enable row level security;

create policy "api_keys_select_own" on public.api_keys
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "api_keys_insert_own" on public.api_keys
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Only used to set revoked_at (see revokeApiKey) -- there is no UI path that edits key_hash/
-- key_prefix/label after creation, but RLS itself doesn't restrict which columns an owner can
-- update, matching every other owner-scoped table in this schema (e.g.
-- notification_channels_update_own): column-level restriction is enforced by what the server
-- action actually sends, not by the policy.
create policy "api_keys_update_own" on public.api_keys
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: a key is revoked, never deleted, so its audit trail (label, created_at,
-- last_used_at, revoked_at) survives -- consistent with #47's acceptance criteria, which only
-- asks for revoke, not delete.
