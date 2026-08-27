-- DNS resolution check type (PRD §5.2, Phase 9, issue #56) -- additive alongside the existing
-- http/tcp checks (see the add_tcp_check_type migration, #55). health_url continues to serve as
-- the overloaded "target" column: for check_type = 'dns', it holds a bare hostname to resolve
-- (e.g. "example.com"), no scheme/port -- same precedent as #55's "host:port" reuse rather than
-- adding a dedicated column.
--
-- Postgres CHECK constraints can't be widened in place -- drop and recreate with the additional
-- allowed value, same approach #55's own migration would have used had it needed to.
alter table public.projects
  drop constraint projects_check_type_valid;

alter table public.projects
  add constraint projects_check_type_valid check (check_type in ('http', 'tcp', 'dns'));

comment on column public.projects.check_type is 'Which kind of check the prober runs for this project (PRD §5.2, #55/#56): ''http'' (GET/POST/HEAD against health_url as a URL, the original/default behavior), ''tcp'' (raw TCP connection to health_url parsed as "host:port"), or ''dns'' (resolves health_url as a bare hostname, no scheme/port). Additive -- every pre-existing row keeps whatever check_type it already had.';
