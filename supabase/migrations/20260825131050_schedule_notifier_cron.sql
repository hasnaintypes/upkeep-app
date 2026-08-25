-- Schedule the notifier Edge Function on a fixed base tick (PRD §5.5,
-- Phase 6, issue #40), same 1-minute cadence as the prober (see
-- schedule_prober_cron) -- matches the Phase 6 exit criteria's "produces a
-- real Discord notification within one prober tick of the incident being
-- detected". Free-tier check: adding this doubles the prober migration's
-- own invocation-budget math to ~17,280 * 2 = 86,400/month combined
-- (~17.3% of the 500,000/month free-tier quota, supabase.com/pricing) --
-- still comfortable headroom at this app's expected scale (~50 projects,
-- PRD §9).
--
-- Overlap protection: deliberately none, unlike the prober's own
-- prober_lock mutex. Two overlapping notifier runs could, in a narrow
-- race, both pick up the same un-notified incident and dispatch twice --
-- an occasional duplicate outbound notification is a minor, self-healing
-- annoyance (the very next successful run marks the row notified either
-- way), not a correctness bug the way the prober's own duplicate-`checks`-
-- row risk would have been (which could double-count toward incident
-- auto-detection). Not worth a second lock table for that tradeoff.
--
-- pg_cron/pg_net are already installed (schedule_prober_cron); this reuses
-- the same `project_url` vault secret and the same `prober_secret_key`
-- value (a project-wide secret key, not something specific to the prober
-- function despite its vault entry's name) -- no new vault secret needed,
-- see docs/ROADMAP.md / README.md's prober setup section for how those
-- were created.
select cron.schedule(
  'invoke-notifier',
  '* * * * *', -- every minute
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'prober_secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
