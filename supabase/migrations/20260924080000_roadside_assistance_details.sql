-- Roadside assistance request details shown to nearby Shahm volunteers.
alter table public.trips
  add column if not exists problem_type text not null default 'مساعدة عامة',
  add column if not exists people_count smallint not null default 1,
  add column if not exists request_notes text not null default '';

alter table public.trips
  drop constraint if exists trips_problem_type_check;
alter table public.trips
  add constraint trips_problem_type_check
  check (problem_type in (
    'مساعدة عامة',
    'عطل ميكانيكي',
    'إطار مثقوب',
    'نفاد الوقود',
    'بطارية السيارة',
    'مشكلة كهربائية',
    'حادث أو طارئ',
    'أخرى'
  ));

alter table public.trips
  drop constraint if exists trips_people_count_check;
alter table public.trips
  add constraint trips_people_count_check
  check (people_count between 1 and 8);

alter table public.trips
  drop constraint if exists trips_request_notes_check;
alter table public.trips
  add constraint trips_request_notes_check
  check (char_length(request_notes) <= 500);

grant select (problem_type, people_count, request_notes)
  on public.trips to authenticated;

-- Nearby requests return the categorical problem and short notes along with
-- the route and distance; exact coordinates stay private.
drop function if exists public.get_pending_trips_nearby(double precision, double precision, double precision);
create function public.get_pending_trips_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 20
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
  problem_type text,
  people_count smallint,
  request_notes text,
  distance_km double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'volunteer'::public.user_role
      and p.is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_lat is null or p_lng is null
    or p_lat not between 22 and 31.7
    or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  return query
  select t.id, t.requester_id, t.volunteer_id,
    t.origin_area_label, t.destination_area_label, t.status,
    t.requester_relation,
    t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    t.problem_type, t.people_count, t.request_notes,
    round((
      6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(l.origin_lat))
        * cos(radians(l.origin_lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(l.origin_lat))
      ))
    )::numeric, 2)::double precision as distance_km
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending'
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))) <= least(greatest(coalesce(p_radius_km, 20), 0), 20)
  order by distance_km asc, t.created_at desc;
end;
$$;

revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision)
  to authenticated;

-- The trusted Edge Function must supply a valid problem category when creating
-- each new request. Keep existing request limits and trusted-IP checks.
drop function if exists public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
);
create function public.create_trip_from_proxy(
  p_requester_id uuid,
  p_origin_area_label text,
  p_origin_address text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_area_label text,
  p_destination_address text,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_requester_relation public.requester_relation,
  p_client_ip inet,
  p_scheduled_at timestamptz,
  p_problem_type text,
  p_people_count smallint,
  p_request_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_requester_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_requester_id and p.role = 'requester'::public.user_role and p.is_active
  ) then
    raise exception 'requester role required';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now()
    or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;
  if p_problem_type not in (
    'عطل ميكانيكي', 'إطار مثقوب', 'نفاد الوقود', 'بطارية السيارة',
    'مشكلة كهربائية', 'حادث أو طارئ', 'أخرى'
  ) then
    raise exception 'نوع المشكلة غير صالح';
  end if;
  if p_people_count not between 1 and 8
    or p_request_notes is null or char_length(p_request_notes) > 500 then
    raise exception 'بيانات عدد الأشخاص أو الملاحظات غير صالحة';
  end if;

  select count(*) into v_completed_count
  from public.trips t
  where t.requester_id = p_requester_id and t.status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from public.trips t
    where t.requester_id = p_requester_id and t.status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label,
    requester_relation, good_faith_ack, ack_at, ack_ip, scheduled_at,
    problem_type, people_count, request_notes
  ) values (
    p_requester_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at,
    p_problem_type, p_people_count, p_request_notes
  ) returning id into v_trip_id;

  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet,
  timestamptz, text, smallint, text
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet,
  timestamptz, text, smallint, text
) to service_role;

-- Return the categorical problem to the accepted helper without requiring a
-- second round trip or exposing any additional requester profile information.
drop function if exists public.accept_trip(uuid, double precision, double precision);
create function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table (
  trip_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation public.requester_relation,
  scheduled_at timestamptz,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  distance_km double precision,
  problem_type text,
  people_count smallint,
  request_notes text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := auth.uid();
  v_distance double precision;
begin
  if v_volunteer_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_volunteer_id
      and p.role = 'volunteer'::public.user_role
      and p.is_active
      and p.vehicle_data_responsibility_ack
      and p.vehicle_type is not null and char_length(trim(p.vehicle_type)) between 2 and 80
      and p.vehicle_color is not null and char_length(trim(p.vehicle_color)) between 2 and 40
      and p.vehicle_plate_number is not null and char_length(trim(p.vehicle_plate_number)) between 3 and 24
  ) then
    raise exception 'volunteer vehicle details required';
  end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
    or p_volunteer_lat not between 22 and 31.7 or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  perform 1 from public.trips t where t.id = p_trip_id for update;
  select * into v_trip from public.trips t where t.id = p_trip_id;
  if not found or v_trip.status <> 'pending'::public.trip_status then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.scheduled_at < now() or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update public.trips t
  set status = 'accepted'::public.trip_status,
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      volunteer_lat = p_volunteer_lat,
      volunteer_lng = p_volunteer_lng,
      accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where t.id = p_trip_id and t.status = 'pending'::public.trip_status;
  if not found then raise exception 'trip is no longer available'; end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision,
    t.problem_type, t.people_count, t.request_notes
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;