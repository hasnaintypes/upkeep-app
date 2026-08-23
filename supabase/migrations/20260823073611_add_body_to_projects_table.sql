-- Add configurable request body for health checks (PRD §5.2: "HTTP(S) GET/POST health checks
-- with configurable method, headers, and body"). A pre-existing gap between the PRD's feature
-- description and the `projects` table (PRD §6, #5), surfaced while implementing #21 and closed
-- here rather than left as a permanent discrepancy.
--
-- Only meaningful for non-GET requests (POST) -- GET requests with a body are rejected by fetch()
-- clients (including Deno's, which the prober Edge Function uses), so the prober only sends this
-- when the project's method isn't GET. No RLS/index changes needed: inherits the existing
-- `projects` policies, and `public.get_due_projects()` (#20) already selects `p.*`.

alter table public.projects
  add column body text;

alter table public.projects
  add constraint projects_body_length check (
    body is null or char_length(body) <= 10000
  );

comment on column public.projects.body is 'Optional request body sent with non-GET health checks (PRD §5.2). Ignored for GET requests.';
