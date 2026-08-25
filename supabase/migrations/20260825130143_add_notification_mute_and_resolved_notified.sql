-- Two additive columns needed by the notifier Edge Function (PRD §5.5,
-- Phase 6, #40):
--
-- 1. project_notification_rules.is_muted -- the schema (Phase 1, #9) never
--    added a mute mechanism despite PRD §5.5's "mute notifications for a
--    project temporarily" and the Phase 6 exit criteria requiring it to
--    work. Lives per-rule (not a whole-project column) so it composes with
--    escalation_threshold/digest_only, which are already per project+
--    channel pairing, and matches the "mute toggle" living inside the
--    per-rule notification-rules UI planned for #45.
--
-- 2. incidents.resolved_notified -- the existing `notified` boolean can
--    only track one transition, but an incident has two independently
--    notifiable transitions (open, resolve). Keeping `notified` meaning
--    "open-notification sent" (its existing default/unused state) and
--    adding this new column for the resolve side avoids a rename/backfill
--    of a column nothing has ever written yet (see #40's own research: no
--    code anywhere sets `notified`, so this is a pure additive change).

alter table public.project_notification_rules
  add column is_muted boolean not null default false;

comment on column public.project_notification_rules.is_muted is
  'Temporarily suppresses dispatch for this specific project+channel pairing without deleting the rule (PRD §5.5). Set/cleared by the future per-project notification rules UI (#45).';

alter table public.incidents
  add column resolved_notified boolean not null default false;

comment on column public.incidents.resolved_notified is
  'Whether the resolve-transition notification has been dispatched (#40) -- independent of `notified`, which tracks the open-transition notification.';
