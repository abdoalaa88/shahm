-- Phase 1.2: pending trips whose 15-minute window (expires_at) passed were
-- staying 'pending' forever — the requester's screen stayed stuck on
-- "أكتر من شهم بيشوفوا طلبك", the "one open trip" guard in
-- create_trip_from_proxy()/create_trip() only checked status = 'pending'
-- (not expires_at), and nothing in the database ever closed these out.
--
-- This migration adds a sweep function and calls it from every place a
-- trip's "is it still open" question matters, so pending requests get
-- closed out as soon as anyone interacts with the system — no pg_cron
-- extension required.

-- Client also needs to read expires_at directly (not just through the
-- distance-filtered nearby-trips RPC) to show the requester their own
-- trip's expiry.
grant select (expires_at) on public.trips to authenticated;

create or replace function public.expire_stale_trips()
returns void
language sql security definer set search_path = public
as $$
  update public.trips
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_stale_trips() from public, anon;
grant execute on function public.expire_stale_trips() to authenticated;

create or replace function public.get_pending_trips_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
)
returns table (
  id uuid, requester_id uuid, volunteer_id uuid, origin_area_label text, destination_area_label text,
  status public.trip_status, requester_relation public.requester_relation, scheduled_at timestamptz,
  created_at timestamptz, accepted_at timestamptz, completed_at timestamptz,
  distance_km double precision, passenger_count smallint, special_notes text
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  perform public.expire_stale_trips();
  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label, t.destination_area_label,
    t.status, t.requester_relation, t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))))))::numeric, 2)::double precision,
    t.passenger_count, t.special_notes
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending' and t.expires_at > now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;
revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_trip(
  p_trip_id uuid, p_volunteer_lat double precision, p_volunteer_lng double precision
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
  perform public.expire_stale_trips();
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' or v_trip.expires_at <= now() then
    raise exception 'trip is no longer available';
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
  where id = p_trip_id and status = 'pending' and expires_at > now();
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

create or replace function public.create_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz, p_passenger_count smallint default 1,
  p_special_notes text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_requester_profile_id from public.profiles
  where auth_user_id = p_requester_id and role = 'requester' and is_active;
  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_passenger_count is null or p_passenger_count not between 1 and 4 then
    raise exception 'passenger count must be between 1 and 4';
  end if;
  if p_special_notes is not null and char_length(p_special_notes) > 500 then
    raise exception 'special notes are too long';
  end if;
  perform public.expire_stale_trips();
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_profile_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at, passenger_count, special_notes
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes',
    p_passenger_count, nullif(trim(p_special_notes), '')
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;

create or replace function public.create_trip(
  p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('requester');
  v_trip_id uuid;
  v_completed_count integer;
begin
  if v_requester_id is null or p_client_ip is null then
    raise exception 'authentication and trusted client IP are required';
  end if;
  perform public.expire_stale_trips();
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at
  ) values (
    v_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes'
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;
