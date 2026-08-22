-- Add project collections/folders grouping (PRD §5.1) to the existing projects table.
--
-- Schema decision (issue #17 acceptance criteria explicitly asks this be decided and
-- documented): a plain nullable text column on `projects`, not a dedicated `collections`
-- table + join. A project belongs to at most one collection ("assign a project to a
-- collection", not multiple), and the PRD describes collections as lightweight grouping
-- labels ("Resume Projects," "Side Projects," "Client Work") with no collection-level
-- metadata of their own (no color, icon, sort order, sharing, etc). A join table would add
-- a new migration, new RLS policies, and query joins for a feature that's functionally
-- identical to a free-text label. This column inherits the existing `projects` RLS
-- policies automatically -- no new RLS work needed (AC's "if a new table is introduced"
-- doesn't apply here). If collections ever need their own metadata later, the values in
-- this column can be extracted into a dedicated table in a follow-up migration without
-- data loss.

alter table public.projects
  add column collection text;

alter table public.projects
  add constraint projects_collection_length check (
    collection is null or char_length(collection) <= 100
  );

comment on column public.projects.collection is 'Optional user-defined grouping label ("folder"), e.g. "Resume Projects" (PRD §5.1). See this migration''s header comment for why this is a plain column, not a dedicated table.';

-- Supports both "list my projects in collection X" and "list my distinct collections"
-- queries, scoped per user.
create index projects_user_id_collection_idx on public.projects (user_id, collection);
