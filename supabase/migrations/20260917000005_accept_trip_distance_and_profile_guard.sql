-- Persist accepted-trip distance, fix reveal_volunteer_contact, and correct
-- the patient-profile guard so it matches the documented Settings behavior.
-- Apply after 20260917000004_volunteer_contact.sql and before
-- 20260917000006_volunteer_locations_for_push.sql.

-- ============================================================
-- 1) accepted_distance_km: computed once at acceptance time, never
--    recomputed from a live volunteer position afterwards (raw volunteer
--    location is never stored on the trip).
-- ============================================================

alter table public.trips
  add column if not exists accepted_distance_km numeric;
alter table public.trips
  drop constraint if exists trips_accepted_distance_km_check;
alter table public.trips
  add constraint trips_accepted_distance_km_check
  check (accepted_distance_km is null or accepted_distance_km >= 0);
create or replace function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table (
  trip_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation public.requester_relation,
  patient_age integer,
  patient_condition text,
  scheduled_at timestamptz,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  distance_km double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip trips%rowtype;
  v_volunteer_id uuid := auth.uid();
  v_distance double precision;
begin
  if not exists (
    select 1 from profiles
    where id = v_volunteer_id and role = 'volunteer' and is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_volunteer_lat is null
     or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from trips where id = p_trip_id for update;

  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;

  if v_trip.scheduled_at < now()
     or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
          * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
        + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
      ))
    )
  into v_distance
  from trip_locations l
  where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update trips
  set status = 'accepted',
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      accepted_distance_km = round(v_distance::numeric, 2)
  where id = p_trip_id
    and status = 'pending';

  if not found then
    raise exception 'trip is no longer available';
  end if;

  return query
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.requester_relation,
    p.patient_age,
    p.patient_condition,
    t.scheduled_at,
    l.origin_address,
    l.origin_lat,
    l.origin_lng,
    l.destination_address,
    l.destination_lat,
    l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from trips t
  join profiles p on p.id = t.requester_id
  join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;
revoke all on function public.accept_trip(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision)
  to authenticated;
-- ============================================================
-- 2) reveal_volunteer_contact: the 000004 version depends on PostGIS
--    (ST_MakePoint/ST_DistanceSphere) and on trips.volunteer_lat/
--    volunteer_lng, neither of which exist anywhere in this schema, so it
--    could never actually run. Replace it with the persisted, already
--    haversine-computed accepted_distance_km — no PostGIS, no extra columns.
-- ============================================================

create or replace function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (
  trip_id uuid,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.accepted_at,
    t.accepted_distance_km
  from trips t
  join profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = auth.uid()
    and t.status in ('accepted', 'completed');
$$;
revoke all on function public.reveal_volunteer_contact(uuid)
  from public, anon, authenticated;
grant execute on function public.reveal_volunteer_contact(uuid)
  to authenticated;
-- Drop the dead, never-populated columns the broken 000004 version added
-- to trips (distinct from trip_locations.origin_lat/origin_lng, which are
-- real and stay untouched). Nothing in the frontend or Edge Functions
-- reads trips.origin_lat/origin_lng directly.
alter table public.trips drop column if exists origin_lat;
alter table public.trips drop column if exists origin_lng;
-- ============================================================
-- 3) Profile guard correction: the "once only" trigger added in 000003
--    (prevent_patient_profile_mutation) blocks the documented Settings
--    feature, where a requester can edit patient age/condition at any
--    time (see handleSaveSettings in the frontend and the README). It is
--    also not part of the approved function list in supabase_check.sql.
--    Remove it. Role/verification_status escalation protection
--    (trg_prevent_profile_privilege_escalation, from 000000) is a
--    separate trigger and is NOT touched by this migration — it remains
--    the only profile guard in force, and continues to apply on every
--    profile update including ones made from the Settings screen.
-- ============================================================

drop trigger if exists trg_prevent_patient_profile_mutation on public.profiles;
drop function if exists public.prevent_patient_profile_mutation();
