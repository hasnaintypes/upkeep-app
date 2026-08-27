-- SSL/TLS certificate validity + expiry check type (PRD §5.2, Phase 9, issue #57) -- additive
-- alongside http/tcp/dns (see the add_tcp_check_type / add_dns_check_type migrations, #55/#56).
-- health_url continues to serve as the overloaded "target" column: for check_type = 'ssl', it
-- holds a "host:port" pair (e.g. "example.com:443"), the exact same format as tcp -- the prober's
-- own check.ts reuses tcp's parseTcpTarget for ssl targets rather than duplicating that parsing.
--
-- Postgres CHECK constraints can't be widened in place -- drop and recreate with the additional
-- allowed value, same approach the previous two check_type migrations used.
alter table public.projects
  drop constraint projects_check_type_valid;

alter table public.projects
  add constraint projects_check_type_valid check (check_type in ('http', 'tcp', 'dns', 'ssl'));

comment on column public.projects.check_type is 'Which kind of check the prober runs for this project (PRD §5.2, #55/#56/#57): ''http'' (GET/POST/HEAD against health_url as a URL, the original/default behavior), ''tcp'' (raw TCP connection to health_url parsed as "host:port"), ''dns'' (resolves health_url as a bare hostname), or ''ssl'' (TLS handshake against health_url parsed as "host:port", inspecting certificate validity/expiry -- degraded, not down, when the certificate is valid but expiring within the prober''s own SSL_EXPIRY_WARNING_DAYS window). Additive -- every pre-existing row keeps whatever check_type it already had.';
