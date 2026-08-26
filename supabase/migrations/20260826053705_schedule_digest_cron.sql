-- Schedule the digest Edge Function (PRD §5.5, Phase 6, issue #46) on two
-- separate `pg_cron` jobs -- one daily, one weekly -- rather than the
-- prober/notifier's shared 1-minute base tick (schedule_prober_cron,
-- schedule_notifier_cron): a digest is inherently a low-frequency, wall-
-- clock-scheduled thing ("send once a day" / "send once a week"), not a
-- "poll for due work" tick, so there's no due-project-style lookup for a
-- 1-minute cadence to usefully shorten -- it would just invoke the function
-- 1,440x/day for nothing to do on all but one of those invocations.
--
-- Each job's request body carries which cadence fired it (`{"frequency":
-- "daily"}` / `{"frequency": "weekly"}`) -- the digest function itself has
-- no other way to know which of the two schedules invoked it, since both
-- point at the same Edge Function URL (one function, not two, per PRD
-- §5.10's plugin/shared-core spirit -- the cadence is a data difference,
-- not a reason to fork the deployment).
--
-- Overlap protection: none, same reasoning as schedule_notifier_cron -- an
-- occasional double-fire (e.g. a cron misfire) would send a duplicate
-- digest email, a minor, self-healing annoyance, not a correctness bug
-- (there's no `checks`/`incidents`-row double-counting risk the way the
-- prober's own mutex exists to prevent). Not worth a lock table for that.
--
-- pg_cron/pg_net and the `project_url`/`prober_secret_key` vault secrets
-- already exist (schedule_prober_cron) -- reused as-is, no new secret
-- needed, same as schedule_notifier_cron's own note.
select cron.schedule(
  'invoke-digest-daily',
  '0 8 * * *', -- 08:00 UTC every day
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{"frequency": "daily"}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'invoke-digest-weekly',
  '0 8 * * 1', -- 08:00 UTC every Monday
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{"frequency": "weekly"}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
