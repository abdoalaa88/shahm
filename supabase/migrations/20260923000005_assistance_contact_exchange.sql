-- Phase 1.1: "عون الطريق" (roadside assistance) was completely broken —
-- accept_assistance_request() returned void (no contact info at all), the
-- accepting شهم had no way to reach the requester, and the requester never
-- found out someone had accepted. This migration:
--   1) records who accepted a request (helper_id / accepted_at),
--   2) makes accept_assistance_request() hand back the requester's contact
--      info directly (same shape as accept_trip()),
--   3) adds reveal_assistance_contact()/get_my_active_assistance_help() so
--      the accepting شهم can re-fetch that contact card after a reload,
--   4) adds get_my_assistance_request() so the requester can see their own
--      request's status and the helper's contact info once accepted,
--   5) adds complete_assistance_request() so either side can close out an
--      accepted request instead of it staying open forever.

alter table public.assistance_requests
  add column if not exists helper_id uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz;

create index if not exists idx_assistance_requests_requester_status
  on public.assistance_requests (requester_id, status, created_at desc);
create index if not exists idx_assistance_requests_helper_status
  on public.assistance_requests (helper_id, status, created_at desc);

-- Dedup table so notify-assistance-accepted sends at most one push per
-- request, exactly like trip_accept_notifications does for trips. RLS is
-- enabled with zero grants to anon/authenticated on purpose: only
-- service_role (which bypasses RLS) touches this table.
create table if not exists public.assistance_accept_notifications (
  assistance_id uuid primary key references public.assistance_requests(id) on delete cascade,
  notified_at timestamptz not null default now()
);
alter table public.assistance_accept_notifications enable row level security;
revoke all on public.assistance_accept_notifications from public, anon, authenticated;
grant all on public.assistance_accept_notifications to service_role;

-- accept_assistance_request now records who accepted and hands the
-- accepting شهم the requester's contact info directly, instead of
-- returning void and leaving the frontend with nothing to show.
-- 20260923000004 defined this function as `returns void`; Postgres cannot change
-- a return type with `create or replace`, so drop it first (the grants are
-- re-applied right after the new definition below).
drop function if exists public.accept_assistance_request(uuid, double precision, double precision);

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'assistance request is no longer available'; end if;
  if v_request.requester_id = v_volunteer_id then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests
    set status = 'accepted', helper_id = v_volunteer_id, accepted_at = now()
  where id = p_assistance_id and status = 'pending';
  if not found then raise exception 'assistance request is no longer available'; end if;
  return query
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng,
    round(v_distance::numeric, 2)::double precision
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.id = p_assistance_id;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

-- Lets the accepting شهم re-fetch the requester's contact card after a
-- reload/reconnect, the same way reveal_contact() does for trips.
create or replace function public.get_my_active_assistance_help()
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision
)
language sql security definer set search_path = public
as $$
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.helper_id = public.my_profile_id('volunteer')
    and a.status = 'accepted'
  order by a.accepted_at desc
  limit 1;
$$;
revoke all on function public.get_my_active_assistance_help() from public, anon;
grant execute on function public.get_my_active_assistance_help() to authenticated;

-- Lets the requester see their own open/accepted request — status, and the
-- helper's contact info once someone accepts — instead of the request just
-- disappearing from their screen with no follow-up.
create or replace function public.get_my_assistance_request()
returns table (
  assistance_id uuid,
  issue_type text,
  description text,
  status text,
  created_at timestamptz,
  helper_id uuid,
  helper_first_name text,
  helper_phone text
)
language sql security definer set search_path = public
as $$
  select a.id, a.issue_type, a.description, a.status, a.created_at,
    h.id, h.first_name, h.phone_number
  from public.assistance_requests a
  left join public.profiles h on h.id = a.helper_id
  where a.requester_id = public.my_profile_id('volunteer')
    and a.status in ('pending', 'accepted')
  order by a.created_at desc
  limit 1;
$$;
revoke all on function public.get_my_assistance_request() from public, anon;
grant execute on function public.get_my_assistance_request() to authenticated;

-- Lets either side of an accepted assistance request close it out, so the
-- new contact-exchange cards this migration adds don't stay open forever.
create or replace function public.complete_assistance_request(p_assistance_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid := public.my_profile_id('volunteer');
begin
  if v_profile_id is null then raise exception 'volunteer role required'; end if;
  update public.assistance_requests set status = 'completed'
  where id = p_assistance_id and status = 'accepted'
    and v_profile_id in (requester_id, helper_id);
  if not found then raise exception 'assistance request cannot be completed'; end if;
end;
$$;
revoke all on function public.complete_assistance_request(uuid) from public, anon;
grant execute on function public.complete_assistance_request(uuid) to authenticated;
