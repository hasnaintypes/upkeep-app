-- Removes 'telegram' from notification_channels.type's allowed values
-- (PRD §5.5, Phase 6, #42 -- decided not to pursue a Telegram
-- ChannelDispatcher implementation: setting up a bot via @BotFather + a
-- chat id is meaningfully more setup friction than Discord's webhook,
-- #41, for the one self-hosting user this app serves today).
--
-- Full removal (code + schema), not just leaving the dispatch-layer stub
-- in place -- a telegram-typed row could otherwise still be created (e.g.
-- once #45's channel-management UI ships) and would only ever fail
-- gracefully forever with no dispatcher behind it. Postgres has no
-- `alter constraint ... set expression`, so this drops and recreates the
-- check constraint under its original name rather than adding a new one.
--
-- No `update ... where type = 'telegram'` backfill needed -- confirmed
-- zero existing rows of that type before writing this migration.

alter table public.notification_channels
  drop constraint notification_channels_type_valid;

alter table public.notification_channels
  add constraint notification_channels_type_valid check (
    type in ('discord', 'email', 'webhook')
  );
