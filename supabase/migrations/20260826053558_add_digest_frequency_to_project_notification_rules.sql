-- Add `digest_frequency` to project_notification_rules (PRD §5.5, Phase 6,
-- issue #46 -- digest mode). #45's own `digest_only` toggle has no cadence
-- of its own to select from, and the PRD explicitly asks for "daily/weekly"
-- as two distinct, user-choosable options ("digest mode - daily/weekly
-- summary email"), so a bare boolean can't express which cadence a rule
-- wants -- this column is the missing piece #46's scheduled job actually
-- reads.
--
-- Lives on the rule (not on `notification_channels` or a new per-user
-- settings table): `digest_only` is already per-rule, and cadence is a
-- property of the same "should this rule's project appear in a digest"
-- decision, not a channel-wide or account-wide setting. A user with rules
-- on both cadences simply receives both a daily and a weekly digest --
-- documented in digest.ts's own module comment, not treated as a conflict
-- to resolve here.
--
-- Only meaningful when `digest_only = true` (enforced at the query level by
-- get_digest_recipients, not by a cross-column check constraint -- Postgres
-- check constraints can't express "column B only matters when column A is
-- true" without ambiguity over what "matters" even means, and get_digest_
-- recipients already the sole reader of this column).
alter table public.project_notification_rules
  add column digest_frequency text not null default 'daily';

alter table public.project_notification_rules
  add constraint project_notification_rules_digest_frequency_valid check (
    digest_frequency in ('daily', 'weekly')
  );

comment on column public.project_notification_rules.digest_frequency is 'Cadence for this rule''s digest email (#46) when digest_only = true. Ignored otherwise.';
