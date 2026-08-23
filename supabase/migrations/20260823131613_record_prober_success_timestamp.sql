-- Self-monitoring: record the prober's own last-successful-run timestamp (PRD §8
-- observability requirement, Phase 3, issue #27).
--
-- Single-row table, same shape/reasoning as prober_lock (a claimable/updatable row via
-- service_role, not per-user data, so it doesn't reference `projects` or carry owner-scoped RLS
-- like `checks`/`checks_aggregated` do). Kept as its own table rather than reusing
-- `prober_lock` -- that table's `is_running`/`started_at` are about mutual exclusion for the
-- *current* run and get overwritten every tick regardless of outcome; this one is a durable
-- record of the last run that actually *succeeded*, which is a different lifecycle and should
-- survive independently of lock state.
--
-- "Successful" here means the Edge Function's full due-check-classify-persist pipeline ran to
-- completion without throwing -- see index.ts, which only calls record_prober_success() right
-- before its final response, not from the early-return error branches (lock acquisition
-- failure, get_due_projects error) or from inside the `finally` block. An individual project's
-- check coming back `down`/`unknown` does NOT fail the run itself -- writeCheckResults (#25)
-- already isolates one project's outcome/persist-error from the rest of the batch -- so a
-- single flaky monitored project can't make this timestamp look stale.
create table public.prober_health (
  id boolean primary key default true,
  last_success_at timestamptz,
  constraint prober_health_single_row check (id = true)
);

comment on table public.prober_health is 'Durable record of the prober''s last genuinely successful run, for self-monitoring/observability (PRD §8, #27). Written by service_role; readable by any authenticated user since it is operational, not per-user, data.';

insert into public.prober_health (id, last_success_at) values (true, null);

alter table public.prober_health enable row level security;

-- Operational data, not per-user data: every authenticated user (a personal/self-hosted
-- instance may still have more than one, e.g. a household or small team) can see whether the
-- prober itself is healthy, unlike `checks`/`checks_aggregated` which are scoped to the
-- requesting user's own projects.
create policy "prober_health_select_authenticated" on public.prober_health
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy for anon/authenticated -- only service_role (bypasses RLS by
-- role) may write, exclusively through record_prober_success() below.
create or replace function public.record_prober_success()
returns void
language sql
set search_path = ''
as $$
  update public.prober_health set last_success_at = now() where id = true;
$$;

comment on function public.record_prober_success() is 'Marks now() as the prober''s last successful run (#27). Called once per Edge Function invocation, only after its full pipeline completes without error -- see index.ts.';

revoke all on function public.record_prober_success() from public, anon, authenticated;
grant execute on function public.record_prober_success() to service_role;
