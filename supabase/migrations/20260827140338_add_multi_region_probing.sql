-- Multi-region probing consensus flag (PRD §5.2, Phase 9, issue #60).
--
-- #60 fans a batch tick's due-project checks out to multiple configured AWS regions (see
-- region-probe.ts's PROBE_REGIONS) via Supabase's documented `x-region`-header regional
-- invocation (https://supabase.com/docs/guides/functions/regional-invocation), writing one raw
-- `checks` row per region -- finally populating the pre-existing, always-null `checks.region`
-- column (Phase 1) -- alongside one additional "consensus" row representing that round's
-- majority-vote-across-regions status. incidents.ts's escalation/auto-resolve streak must only
-- ever look at consensus rows, never each region's own raw row, or a single region's transient
-- network partition to an otherwise-healthy project would count as its own independent `down`
-- data point toward the streak -- exactly the false positive #60 exists to eliminate.
--
-- Defaults to true so every pre-#60 row (and every future non-regionally-probed row: a manual
-- "run check now" check, or a batch tick where the regional fan-out found nothing due to probe)
-- keeps counting toward the escalation streak exactly as it always has -- only the N new raw
-- per-region rows a regionally fanned-out tick writes alongside their one consensus row are
-- explicitly false.
alter table public.checks
  add column is_consensus boolean not null default true;

comment on column public.checks.is_consensus is 'True for the one row per check round that counts toward incidents.ts''s escalation/resolution streak (PRD §5.4) -- either a single-region check (pre-#60 behavior, unchanged) or #60''s majority-vote-across-regions consensus row. False only for the N raw per-region diagnostic rows a regionally fanned-out batch tick writes alongside that one consensus row (see checks.region, populated by those same N rows).';
