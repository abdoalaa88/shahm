-- Enforce the current 7km service radius server-side without exposing the value in UI.

create or replace function public.get_pending_trips_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
)
returns table (
  id uuid,
  requester_id uuid,
  volunteer_id uuid,
  origin_area_label text,
  destination_area_label text,
  status public.trip_status,
  requester_relation public.requester_relation,
  scheduled_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  distance_km double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then
    raise exception 'volunteer role required';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between 22 and 31.7
     or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label,
    t.destination_area_label, t.status, t.requester_relation, t.scheduled_at,
    t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))))::numeric, 2)::double precision
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending'
    and t.scheduled_at >= now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    )))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;

create or replace function public.volunteer_can_see_pending_trip(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_locations l
    join public.volunteer_locations vl on vl.user_id = public.my_profile_id('volunteer')
    where l.trip_id = p_trip_id
      and 6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(vl.lat)) * cos(radians(l.origin_lat))
        * cos(radians(l.origin_lng) - radians(vl.lng))
        + sin(radians(vl.lat)) * sin(radians(l.origin_lat))
      ))) <= 7
  );
$$;

create or replace function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table (
  trip_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer,
  patient_condition text, scheduled_at timestamptz,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision,
  destination_lng double precision, distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.scheduled_at + interval '1 hour' < now() then
    raise exception 'انتهت مهلة هذا الطلب';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 7 then
    raise exception 'هذا الطلب خارج النطاق المتاح';
  end if;

  update public.trips set status = 'accepted', volunteer_id = v_volunteer_id,
    accepted_at = now(), accepted_distance_km = round(v_distance::numeric, 2)
  where id = p_trip_id and status = 'pending';
  if not found then raise exception 'trip is no longer available'; end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision), public.volunteer_can_see_pending_trip(uuid) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision), public.volunteer_can_see_pending_trip(uuid) to authenticated;
revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;
