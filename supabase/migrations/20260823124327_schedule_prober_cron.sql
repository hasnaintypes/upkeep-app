-- Schedule the prober Edge Function on a fixed base tick (PRD §5.2/§7, Phase 3, issue #26).
--
-- Base tick: every 1 minute, matching the PRD §7 architecture diagram's example tick exactly.
-- Free-tier check (Phase 3 readiness checklist item, confirmed here since it was still
-- unrecorded): Supabase's free tier includes 500,000 Edge Function invocations/month
-- (https://supabase.com/pricing). A 1-minute tick is 60 x 24 x 30 = 43,200 invocations/month,
-- ~8.6% of that quota, comfortably within budget at the PRD's expected scale (~50 projects) even
-- before accounting for per-project check_interval_seconds meaning most ticks find nothing due.
--
-- Overlap protection: net.http_post() (used below) is fire-and-forget -- it queues the HTTP
-- request and returns immediately, so pg_cron's own scheduling has no way to observe (and
-- doesn't need to prevent) two ticks "overlapping" at the SQL level. The real overlap risk is
-- entirely inside the Edge Function's own execution: if one invocation's full due-check-classify-
-- persist pipeline takes longer than one tick to finish, a second invocation's
-- get_due_projects() call could run before the first has written its `checks` rows, and pick up
-- the same projects as still-due. prober_lock below is a simple, connection-pooling-safe mutex
-- (a claimable row, not a session-scoped pg_advisory_lock, which wouldn't reliably span the
-- multiple separate PostgREST calls one Edge Function invocation makes) that the Edge Function
-- itself acquires at the start of a run and releases at the end (see index.ts).

create table public.prober_lock (
  id boolean primary key default true,
  is_running boolean not null default false,
  started_at timestamptz,
  constraint prober_lock_single_row check (id = true)
);

comment on table public.prober_lock is 'Single-row mutex preventing overlapping prober Edge Function runs (#26). service_role only.';

insert into public.prober_lock (id, is_running) values (true, false);

alter table public.prober_lock enable row level security;
-- No policies granted to anon/authenticated -- only service_role (which bypasses RLS by role,
-- not by policy) should ever read or write this table.

-- Atomically claims the lock: succeeds if it's free, or if the previous holder crashed without
-- releasing it (stale_after_seconds ago) -- self-healing so one crashed run doesn't permanently
-- block the prober. The UPDATE's row-level locking is what makes this safe against two
-- concurrent callers: only one can actually perform the update while the row's old (available)
-- state is still visible to it.
create or replace function public.try_acquire_prober_lock(stale_after_seconds integer default 300)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.prober_lock
  set is_running = true, started_at = now()
  where id = true
    and (
      is_running = false
      or started_at < now() - (stale_after_seconds || ' seconds')::interval
    );

  return found;
end;
$$;

create or replace function public.release_prober_lock()
returns void
language sql
set search_path = ''
as $$
  update public.prober_lock set is_running = false where id = true;
$$;

comment on function public.try_acquire_prober_lock(integer) is 'Atomically claims the prober run lock; returns false if another run is already in progress and not stale.';
comment on function public.release_prober_lock() is 'Releases the prober run lock. Must be called even on error (see index.ts finally block).';

revoke all on function public.try_acquire_prober_lock(integer) from public, anon, authenticated;
revoke all on function public.release_prober_lock() from public, anon, authenticated;
grant execute on function public.try_acquire_prober_lock(integer) to service_role;
grant execute on function public.release_prober_lock() to service_role;

-- Required to schedule and fire the HTTP call below.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The actual secret values are deliberately NOT in this migration (never commit secrets to git).
-- Before this job can succeed, run once, per docs/ROADMAP.md / README.md's prober setup section:
--   select vault.create_secret('https://bcidrdatrrhkicszuoeb.supabase.co', 'project_url');
--   select vault.create_secret('<your SUPABASE_SECRET_KEY value>', 'prober_secret_key');
-- (matches Supabase's own documented pattern: https://supabase.com/docs/guides/functions/schedule-functions)
select cron.schedule(
  'invoke-prober',
  '* * * * *', -- every minute
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/prober',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
