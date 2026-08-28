-- Raw `checks` pruning function for Phase 10 data retention (PRD §5.3/§10,
-- ROADMAP Phase 10, issue #63). Depends on #62's rollup job: a raw row is
-- only ever deleted once its containing UTC hour has an hourly
-- `checks_aggregated` row for that project -- never based on age alone.
--
-- Retention window: 7 days (PRD §10, decided in #62) -- `p_retention_days`
-- defaults to 7 but is parameterized rather than hardcoded, so the pruning
-- Edge Function (and this function's own manual/ad hoc invocation) can
-- override it without a migration, matching how every other "decided but
-- might need revisiting" numeric knob in this schema (e.g.
-- MANUAL_CHECK_COOLDOWN_SECONDS) stays a named constant, not a magic
-- number baked into the query.
--
-- Correctness guard (#63's own acceptance criteria: never delete a raw
-- row for a period that hasn't been rolled up yet): the `exists` clause
-- requires an hourly `checks_aggregated` row for that exact
-- `(project_id, date_trunc('hour', checked_at))` pair before a row is
-- eligible for deletion. This intentionally prunes *every* raw row in an
-- already-aggregated hour, not just `is_consensus = true` ones -- the
-- non-consensus per-region diagnostic rows a multi-region-probing tick
-- writes alongside its one consensus row (add_multi_region_probing
-- migration) are never separately aggregated, so age-gating them on their
-- own would leave them stuck forever; once their hour's consensus data is
-- safely archived in checks_aggregated, the diagnostic rows have served
-- their purpose and are safe to drop with it.
--
-- No overlap lock (unlike the prober's `prober_lock` mutex): a plain
-- `delete ... where <cutoff and already-aggregated>` is idempotent by
-- construction -- two concurrent runs just both attempt to delete the
-- same already-matching rows; the second one deletes zero once the first
-- commits. Same reasoning as rollup_hourly_checks/rollup_daily_checks's
-- own "no lock needed" note.
--
-- `security invoker` (the default) and revoked from
-- public/anon/authenticated, granted to service_role only -- same pattern
-- as the rollup functions: the prune Edge Function's service_role client
-- already bypasses RLS by role, so there's no reason for this to run as
-- definer, and no other caller should ever invoke it (checks has no
-- delete policy at all, only a select policy for the owning user -- see
-- create_checks_table migration).
--
-- Returns the number of raw rows deleted, for the calling Edge Function's
-- own run summary (see prune/prune.ts).
create or replace function public.prune_raw_checks(p_retention_days integer default 7)
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from public.checks c
    where c.checked_at < (now() - (p_retention_days || ' days')::interval)
      and exists (
        select 1
        from public.checks_aggregated ca
        where ca.project_id = c.project_id
          and ca.period_type = 'hourly'
          and ca.period_start = date_trunc('hour', c.checked_at)
      )
    returning 1
  )
  select count(*)::integer from deleted;
$$;

comment on function public.prune_raw_checks(integer) is 'Deletes raw checks rows older than p_retention_days (default 7, PRD §10) that already have an hourly checks_aggregated row for their project+hour (#63). service_role only.';

revoke all on function public.prune_raw_checks(integer) from public, anon, authenticated;
grant execute on function public.prune_raw_checks(integer) to service_role;
