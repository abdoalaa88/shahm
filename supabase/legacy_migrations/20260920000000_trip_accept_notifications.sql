-- PHASE 3 fix: the "notify requester once per trip acceptance, stop after
-- 15 minutes" behavior described in README/hand-offs since PHASE 2 was
-- never actually backed by a database object. This migration adds the
-- missing atomic claim table so supabase/functions/notify-trip-accepted can
-- guarantee a single push per trip even if the browser calls it more than
-- once (retry, double click, multiple tabs).
--
-- No RLS policies are added on purpose: RLS is enabled with zero grants to
-- anon/authenticated, which denies them entirely by default. Only
-- service_role (which bypasses RLS) is meant to touch this table, exactly
-- like public.volunteer_locations in 20260917000006.
--
-- Apply after 20260919000001_resolve_report.sql (this repo's migrations are
-- ordered by filename timestamp; do not renumber existing files).

create table if not exists public.trip_accept_notifications (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  notified_at timestamptz not null default now()
);
alter table public.trip_accept_notifications enable row level security;
revoke all on public.trip_accept_notifications from public, anon, authenticated;
grant all on public.trip_accept_notifications to service_role;
