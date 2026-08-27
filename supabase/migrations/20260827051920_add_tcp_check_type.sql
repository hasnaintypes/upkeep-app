-- TCP port check type (PRD §5.2, Phase 9, issue #55) -- additive alongside the existing HTTP
-- GET/POST/HEAD check, defaulting every existing row to 'http' so current projects are completely
-- unaffected (issue #55's own acceptance criterion).
--
-- No new host/port columns: `health_url` becomes an overloaded "target" column, holding either an
-- HTTP(S) URL (check_type = 'http', unchanged from before) or a bare "host:port" string
-- (check_type = 'tcp') -- mirrors the existing precedent of `method`/`body`/`expected_status`
-- already being conditionally meaningful depending on another column's value, rather than adding
-- a parallel set of tcp_host/tcp_port columns that would sit null for every http row (and vice
-- versa). Format validation lives in application code (src/features/projects/lib/validation.ts's
-- healthUrlSchema/tcpTargetSchema and this Edge Function's own check.ts's parseTcpTarget) --
-- same precedent as `method`, which also has no DB-level enum constraint.
alter table public.projects
  add column check_type text not null default 'http';

alter table public.projects
  add constraint projects_check_type_valid check (check_type in ('http', 'tcp'));

comment on column public.projects.check_type is 'Which kind of check the prober runs for this project (PRD §5.2, #55): ''http'' (GET/POST/HEAD against health_url as a URL, the original/default behavior) or ''tcp'' (opens a raw TCP connection to health_url parsed as "host:port", no request/response body or status to grade). Additive: every pre-existing row defaulted to ''http'' at migration time, so no existing project''s behavior changed.';
