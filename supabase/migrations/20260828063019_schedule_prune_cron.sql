-- Schedules the `prune` Edge Function (PRD §5.3/§10, Phase 10, issue #63)
-- on one daily `pg_cron` job -- pruning is not time-critical (the
-- retention window is measured in days, PRD §10's decided 7), so a single
-- wall-clock run per day is enough, same "low-frequency, scheduled" model
-- as digest/rollup's own daily jobs, not the prober/notifier's 1-minute
-- poll.
--
-- Runs at 00:20 UTC -- 10 minutes after `invoke-rollup-daily` (00:10 UTC,
-- see schedule_rollup_cron), so any hour that just became eligible for
-- pruning (i.e. every hour of the day that just ended, once its daily
-- rollup has also finished) is guaranteed to already have its hourly
-- checks_aggregated row written before this runs. Not a hard dependency
-- prune_raw_checks itself only checks for the *hourly* row, not daily --
-- just a deliberate ordering so pruning never races a same-day rollup.
--
-- No request body needed (unlike digest/rollup, which need to know which
-- cadence/granularity fired them) -- `prune` has exactly one thing to do
-- per invocation, same "empty body triggers the one thing this function
-- does" shape as the prober/notifier's own batch tick.
--
-- Overlap protection: none, same reasoning as schedule_rollup_cron's own
-- note -- prune_raw_checks's delete is idempotent by construction.
--
-- pg_cron/pg_net and the `project_url`/`prober_secret_key` vault secrets
-- already exist (schedule_prober_cron) -- reused as-is, no new secret
-- needed.
select cron.schedule(
  'invoke-prune',
  '20 0 * * *', -- 00:20 UTC every day
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/prune',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
