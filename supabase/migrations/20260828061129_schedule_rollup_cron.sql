-- Schedules the `rollup` Edge Function (PRD §5.3, Phase 10, issue #62) on
-- two wall-clock `pg_cron` jobs -- same "low-frequency, scheduled" model as
-- schedule_digest_cron, not the prober/notifier's 1-minute due-work poll:
-- a rollup has no per-project "is it due" check to make polling useful for,
-- it's always "roll up the period that just completed."
--
-- Timing is the one thing that matters here: the daily job depends on
-- every hourly rollup for the previous UTC day already existing (see
-- rollup_daily_checks's own comment -- it reads *hourly* checks_aggregated
-- rows, not raw checks). Hourly runs at :05 past every hour, rolling up
-- the hour that ended at :00 (rollup.ts's `previousHourStart`) -- so by the
-- time the daily job fires at 00:10 UTC, the [23:00, 00:00) hour of the
-- day that just ended was already rolled up at 00:05, completing that
-- day's 24th and final hourly row 5 minutes earlier. Daily rolls up the
-- UTC day that just ended (rollup.ts's `previousDayStart`), matching that
-- window exactly.
--
-- Request body carries which granularity fired it (`{"period_type":
-- "hourly"}` / `{"period_type": "daily"}`) -- same one-function/
-- data-not-deployment-difference shape as schedule_digest_cron's
-- `frequency` field.
--
-- Overlap protection: none needed -- rollup_hourly_checks/rollup_daily_checks
-- upsert on checks_aggregated's own unique constraint
-- (project_id, period_start, period_type), so a duplicate concurrent fire
-- for the same period just recomputes and overwrites the same row with the
-- same values, not a second one. Same "naturally idempotent, no lock
-- table needed" reasoning as schedule_digest_cron.
--
-- pg_cron/pg_net and the `project_url`/`prober_secret_key` vault secrets
-- already exist (schedule_prober_cron) -- reused as-is, no new secret
-- needed.
select cron.schedule(
  'invoke-rollup-hourly',
  '5 * * * *', -- 5 minutes past every hour
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/rollup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{"period_type": "hourly"}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'invoke-rollup-daily',
  '10 0 * * *', -- 00:10 UTC every day
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/rollup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{"period_type": "daily"}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
