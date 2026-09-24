-- profiles.patient_age is smallint in this database (not integer as the
-- original migrations assumed). accept_trip() declares patient_age as
-- integer in its RETURNS TABLE and uses RETURN QUERY (plpgsql), which
-- requires an exact type match (not just an implicit cast) between the
-- query's column types and the declared OUT types. The smallint/integer
-- mismatch was throwing Postgres error 42804 (datatype mismatch) on every
-- accept_trip call, AFTER the trip had already been updated to 'accepted'
-- inside the same function — so the UPDATE succeeded but the caller only
-- ever saw a generic failure, and the trip was silently already taken.
-- Fix: cast patient_age to integer explicitly in both functions that
-- return it.

create or replace function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table(
  trip_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation requester_relation,
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
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then
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

  if v_trip.scheduled_at + interval '1 hour' < now() then
    raise exception 'انتهت مهلة هذا الطلب';
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

  if v_distance is null or v_distance > 10 then
    raise exception 'هذا الطلب خارج نطاق 10 كم من موقعك الحالي';
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
    p.patient_age::integer,
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

create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
  trip_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation requester_relation,
  patient_age integer,
  patient_condition text,
  scheduled_at timestamptz,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision
)
language sql
security definer
set search_path = public
as $$
select
  t.id,
  p.id,
  p.first_name,
  p.phone_number,
  t.requester_relation,
  p.patient_age::integer,
  p.patient_condition,
  t.scheduled_at,
  l.origin_address,
  l.origin_lat,
  l.origin_lng,
  l.destination_address,
  l.destination_lat,
  l.destination_lng
from trips t
join profiles p
  on p.id = t.requester_id
join trip_locations l
  on l.trip_id = t.id
where t.id = p_trip_id
  and t.volunteer_id = auth.uid()
  and t.status in ('accepted', 'completed');
$$;
;
