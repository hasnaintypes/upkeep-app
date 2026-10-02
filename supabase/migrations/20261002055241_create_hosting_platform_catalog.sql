-- Reference catalog of hosting platforms + tiers, for the "Platform Usage Budgets" feature
-- (docs/ROADMAP.md Phase 12). Health checks and keep-alive pings run on the *monitored
-- project's* host, consuming that host's own free-tier compute allowance (Vercel Active CPU
-- minutes, Render instance-hours, etc.) -- this catalog is the reference data a user picks
-- from when telling Upkeep roughly how much of that allowance a project may use.
--
-- Deliberately plain lookup tables (not enums): a platform's free-tier numbers drift over
-- time, so correcting them later is a data-only migration, not a code change. `source_url`/
-- `verified_at` exist so a stale number is traceable and fixable, not silently wrong forever.
--
-- Every row is in "minutes of compute per month" even though each platform's real billing
-- unit differs (Vercel: literal Active CPU minutes; Render: instance-hours, i.e. wall-clock
-- uptime, not CPU time; Appwrite: a request/execution count; Railway: a dollar-credit, not
-- time at all) -- this is a deliberate, disclosed simplification for a v1 that is an
-- allocation *estimate*, not a real usage meter (see `notes` on each tier for the specific
-- caveat). A `null` free_quota_minutes_per_month means "not a fixed monthly time quota" --
-- paid/pay-as-you-go tiers, and tiers whose real unit can't be approximated at all (e.g.
-- Railway's $-credit model) -- the user can still type in their own number on the
-- `platform_accounts` row that references it.

create table public.hosting_platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.hosting_platforms is 'Reference catalog of hosting platforms (Vercel, Render, ...) a platform_accounts row can reference. Seeded by this migration; not user-writable.';

create table public.hosting_platform_tiers (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.hosting_platforms (id) on delete cascade,
  slug text not null,
  name text not null,
  free_quota_minutes_per_month integer,
  notes text,
  source_url text,
  verified_at date,
  created_at timestamptz not null default now(),
  constraint hosting_platform_tiers_platform_slug_unique unique (platform_id, slug),
  constraint hosting_platform_tiers_quota_non_negative check (
    free_quota_minutes_per_month is null or free_quota_minutes_per_month >= 0
  )
);

comment on table public.hosting_platform_tiers is 'Reference catalog of tiers within a hosting_platforms row (e.g. Vercel Hobby). Seeded by this migration; not user-writable. See table-level comment on hosting_platforms for why every quota is approximated in minutes/month.';
comment on column public.hosting_platform_tiers.free_quota_minutes_per_month is 'Approximate free monthly compute allowance, in minutes. Null means "not a fixed monthly time quota" (paid/pay-as-you-go, or a billing unit that doesn''t map to time) -- see notes.';
comment on column public.hosting_platform_tiers.notes is 'Caveat about this tier''s real billing unit vs. the minutes/month approximation above, shown to the user picking this tier.';
comment on column public.hosting_platform_tiers.verified_at is 'Date these numbers were last checked against the platform''s own pricing page -- free-tier limits change often; treat a stale date as a reason to re-verify, not as fact.';

create index hosting_platform_tiers_platform_id_idx on public.hosting_platform_tiers (platform_id);

alter table public.hosting_platforms enable row level security;
alter table public.hosting_platform_tiers enable row level security;

-- Reference data: readable by any signed-in user, never written by the client (only by a
-- future migration, if a platform's numbers need correcting).
create policy "hosting_platforms_select_all" on public.hosting_platforms
  for select
  to authenticated
  using (true);

create policy "hosting_platform_tiers_select_all" on public.hosting_platform_tiers
  for select
  to authenticated
  using (true);

-- Seed data. Sourced 2026-10-02 via web search against each platform's current pricing
-- coverage (no single platform publishes a plain "minutes/month" figure, so see each tier's
-- own `notes` for how the number was derived) -- re-verify before relying on these for a
-- real allocation decision months from now.
insert into public.hosting_platforms (slug, name) values
  ('vercel', 'Vercel'),
  ('render', 'Render'),
  ('railway', 'Railway'),
  ('appwrite', 'Appwrite'),
  ('fly_io', 'Fly.io'),
  ('other', 'Other / Self-hosted (VPS, etc.)');

insert into public.hosting_platform_tiers
  (platform_id, slug, name, free_quota_minutes_per_month, notes, source_url, verified_at)
select p.id, t.slug, t.name, t.free_quota_minutes_per_month, t.notes, t.source_url, t.verified_at
from public.hosting_platforms p
join (
  values
    ('vercel', 'hobby', 'Hobby (Free)', 240,
      '4 hours of Active CPU time/month on the Hobby plan -- a literal CPU-time budget, so this is the most direct minutes/month figure in this catalog. Non-commercial projects only; overage is billed per hour on Hobby if exceeded.',
      'https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing', date '2026-10-02'),
    ('vercel', 'pro', 'Pro / Paid', null,
      'Paid plans bill Active CPU usage directly rather than capping it at a free monthly figure -- track your own budget here if you want a self-imposed ceiling.',
      null, null),
    ('render', 'free', 'Free', 45000,
      '750 instance-hours/month, shared across every service in the workspace (not per-service) -- this is wall-clock uptime, not CPU-active time, so a free service left running continuously (e.g. kept awake by frequent pings) can exhaust this even with near-zero actual load. Spins down after 15 minutes idle; a ping restarts it (~1 minute cold start).',
      'https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026', date '2026-10-02'),
    ('render', 'paid', 'Starter+ / Paid', null,
      'Paid services run continuously and bill per-service rather than drawing from a shared free-hours pool.',
      null, null),
    ('railway', 'free', 'Free ($0/mo)', null,
      'Railway''s free plan grants a small monthly dollar credit ($1/mo as of late 2026), not a time allowance -- there is no clean minutes/month conversion. Enter your own estimate if you want to track a self-imposed ceiling, or leave this account''s quota blank.',
      'https://dev.to/nayankyada/railway-pricing-2026-free-tier-limits-usage-costs-when-to-upgrade-1acm', date '2026-10-02'),
    ('railway', 'hobby', 'Hobby+ / Paid', null,
      'Usage-based billing above a monthly minimum -- not a fixed free pool.',
      null, null),
    ('appwrite', 'free', 'Free', 3750,
      'Appwrite''s free tier caps function *executions* at 750,000/month, not CPU time -- this figure assumes ~300ms/execution (this catalog''s own default assumed-cost) purely to place it on the same minutes/month scale as other platforms. If your health-check function runs meaningfully longer or shorter than that, this number will be off; adjust the account''s own assumed-ms-per-request accordingly.',
      'https://appwrite.io/blog/post/best-free-hosting-platforms-you-probably-havent-tried-in-2026', date '2026-10-02'),
    ('appwrite', 'pro', 'Pro / Paid', null,
      'Paid tier bills per-project with itemized overages rather than a shared free execution pool.',
      null, null),
    ('fly_io', 'trial', 'Free trial (new accounts)', 120,
      'New accounts no longer get a recurring free tier -- just a one-time trial capped at 2 hours of compute OR 7 days, whichever comes first. This is not a monthly allowance; budgeting against it long-term will be wrong by design once the trial ends.',
      'https://www.saaspricepulse.com/tools/flyio', date '2026-10-02'),
    ('fly_io', 'legacy_free', 'Legacy free allowance (pre-2024 accounts)', null,
      'Accounts created before Fly.io''s 2024 policy change may still keep a recurring free allowance (3 shared-CPU VMs, 3GB storage, 160GB transfer) -- not time-denominated, so there''s no automatic minutes/month figure; enter your own estimate if this applies to you.',
      null, null),
    ('fly_io', 'paid', 'Pay-as-you-go', null,
      'Fully usage-based; no free monthly pool.',
      null, null),
    ('other', 'custom', 'Custom (VPS / unlisted platform)', null,
      'No preset -- you know your own box''s limits (or lack of any) best. Enter a monthly minute budget on the account if you want Upkeep to derive a check interval from it, or leave it blank to size the interval manually as before.',
      null, null)
) as t (platform_slug, slug, name, free_quota_minutes_per_month, notes, source_url, verified_at)
  on t.platform_slug = p.slug;
