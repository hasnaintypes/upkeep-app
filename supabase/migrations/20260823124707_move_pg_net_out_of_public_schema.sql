-- Fix: the previous migration's `create extension if not exists pg_net;` installed the
-- extension into the default (public) schema, flagged by Supabase's security advisor
-- ("Extension in Public" -- extensions shouldn't live alongside application tables/functions in
-- the API-exposed public schema). pg_net's actual callable functions (net.http_post, etc.) live
-- in their own dedicated `net` schema regardless of where the extension itself is cataloged, so
-- moving it here doesn't change anything callers (including the cron job from the previous
-- migration) need to reference.
--
-- pg_net's control file marks it non-relocatable, so `ALTER EXTENSION ... SET SCHEMA` is
-- rejected outright (confirmed by actually running it against the hosted project, not assumed) --
-- drop and recreate in the target schema instead. Nothing else has a hard (pg_depend) dependency
-- on the extension itself: the cron job created in the previous migration stores its command as
-- plain text in cron.job, not a schema-bound reference, so it's unaffected.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
