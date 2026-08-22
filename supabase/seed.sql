-- Local dev fixture data (PRD/Phase 1, docs/ROADMAP.md). Runs automatically on `supabase start`
-- and `supabase db reset` via the [db.seed] config in supabase/config.toml.
--
-- IMPORTANT: this file targets a *local* Postgres instance only. It inserts directly into
-- auth.users/auth.identities to create a sign-in-capable dev fixture user, which is a supported
-- pattern for local seeding but must NEVER be run against the hosted project (no real users,
-- emails, or URLs are used here — everything is a fixture).

-- ---------------------------------------------------------------------------------------------
-- Fixture dev user (local sign-in only)
-- ---------------------------------------------------------------------------------------------
-- pgcrypto backs the password hash below. Already enabled by default in the local Supabase
-- Postgres image; `if not exists` makes this a no-op if so.
create extension if not exists pgcrypto with schema extensions;

-- Email: dev@upkeep.local / Password: devpassword123 (local dev only, not a real credential).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'dev@upkeep.local',
  extensions.crypt('devpassword123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  now(),
  now()
);

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'dev@upkeep.local'
  ),
  'email',
  now(),
  now(),
  now()
);

-- ---------------------------------------------------------------------------------------------
-- Fixture projects, owned by the dev user above
-- ---------------------------------------------------------------------------------------------
-- 00...101  Portfolio Site   — always up, keep-alive enabled
-- 00...102  Side API         — past incident: a resolved down streak in its check history
-- 00...103  Demo App         — degraded/waking pattern (cold-start prone, no keep-alive)
-- 00...104  Old Hackathon    — inactive/paused, stale check history

insert into public.projects (
  id, user_id, name, description, health_url, method, expected_status,
  check_interval_seconds, timeout_ms, retry_count, hosting_provider, tags,
  is_active, keep_alive_enabled
) values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'Portfolio Site',
    'Personal portfolio and resume site.',
    'https://portfolio.example.com/health',
    'GET', 200, 300, 10000, 1,
    'Vercel', array['frontend', 'portfolio'],
    true, true
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'Side API',
    'Small side-project REST API.',
    'https://side-api.example.com/health',
    'GET', 200, 300, 10000, 1,
    'Render', array['backend', 'api'],
    true, true
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    'Demo App',
    'Client demo app prone to cold starts on its free-tier host.',
    'https://demo-app.example.com/health',
    'GET', 200, 900, 15000, 2,
    'Railway', array['demo', 'fullstack'],
    true, false
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    'Old Hackathon Project',
    'Archived hackathon project, no longer actively monitored.',
    'https://old-hackathon.example.com/health',
    'GET', 200, 300, 10000, 1,
    'Netlify', array['archived'],
    false, false
  );

-- ---------------------------------------------------------------------------------------------
-- Checks history
-- ---------------------------------------------------------------------------------------------

-- Portfolio Site: healthy for the last 24h, checked every 5 minutes.
insert into public.checks (project_id, status, http_status, response_time_ms, checked_at)
select
  '00000000-0000-0000-0000-000000000101',
  'up',
  200,
  100 + (random() * 100)::int,
  now() - (n || ' minutes')::interval
from generate_series(0, 1440, 5) as n;

-- Side API: healthy for the last 24h, except a 1-hour down streak 7-8 hours ago (see incident
-- below) — every check inside that window failed, then it recovered on its own.
insert into public.checks (project_id, status, http_status, response_time_ms, error_message, checked_at)
select
  '00000000-0000-0000-0000-000000000102',
  case when down_window then 'down' else 'up' end,
  case when down_window then null else 200 end,
  case when down_window then null else 100 + (random() * 150)::int end,
  case when down_window then 'connection timed out' else null end,
  checked_at
from (
  select
    now() - (n || ' minutes')::interval as checked_at,
    now() - (n || ' minutes')::interval
      between now() - interval '8 hours' and now() - interval '7 hours' as down_window
  from generate_series(0, 1440, 5) as n
) windowed;

-- Demo App: cold-start-prone pattern over the last 24h, checked every 15 minutes — mostly up,
-- with some slow "degraded" responses and some full cold-start "waking" responses.
insert into public.checks (project_id, status, http_status, response_time_ms, checked_at)
select
  '00000000-0000-0000-0000-000000000103',
  class,
  200,
  case class
    when 'waking' then 6000 + (random() * 4000)::int
    when 'degraded' then 2000 + (random() * 1500)::int
    else 100 + (random() * 150)::int
  end,
  checked_at
from (
  select
    now() - (n || ' minutes')::interval as checked_at,
    case
      when random() < 0.15 then 'waking'
      when random() < 0.30 then 'degraded'
      else 'up'
    end as class
  from generate_series(0, 1440, 15) as n
) classified;

-- Old Hackathon Project: paused, stale history — last checked 10 days ago, nothing since.
insert into public.checks (project_id, status, http_status, response_time_ms, checked_at)
select
  '00000000-0000-0000-0000-000000000104',
  'up',
  200,
  150 + (random() * 50)::int,
  now() - interval '10 days' - (n || ' hours')::interval
from generate_series(0, 72, 6) as n;

-- ---------------------------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------------------------

-- Matches the Side API down streak above: auto-detected, since resolved on its own.
insert into public.incidents (project_id, started_at, resolved_at, cause, notified)
values (
  '00000000-0000-0000-0000-000000000102',
  now() - interval '8 hours',
  now() - interval '7 hours',
  'Host restarted after a deploy; recovered without manual intervention.',
  true
);
