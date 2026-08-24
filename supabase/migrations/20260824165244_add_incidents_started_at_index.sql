-- Supports the global (all-projects) incident history view (PRD §5.4,
-- Phase 5, #39): that query orders by started_at with no project_id
-- predicate (RLS's own correlated exists() against `projects` scopes it,
-- see incidents_select_own, Phase 1) -- the existing
-- incidents_project_id_started_at_idx (project_id, started_at desc) serves
-- the per-project view (#38) well but doesn't serve a global, unfiltered
-- started_at-desc scan/sort efficiently.

create index incidents_started_at_idx on public.incidents (started_at desc);
