-- Requests are immediate. Keep the existing RPC signature for deployed
-- callers, but derive the scheduled/created timestamp from Postgres so a
-- client clock difference cannot reject a valid ride or create a future ride.
create or replace function public.create_medical_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz, p_people_count smallint, p_request_notes text,
  p_patient_profile_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_completed_count integer;
  v_now timestamptz := now();
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_requester_id is null or p_client_ip is null or p_patient_profile_id is null then
    raise exception 'requester, patient and trusted client IP are required';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_requester_id
      and p.role = 'requester'::public.user_role
      and p.is_active
  ) then
    raise exception 'requester role required';
  end if;
  if not exists (
    select 1 from public.patient_profiles pp
    where pp.id = p_patient_profile_id
      and pp.requester_profile_id = p_requester_id
  ) then
    raise exception 'patient profile does not belong to requester';
  end if;
  if p_requester_relation is null
    or p_people_count is null or p_people_count not between 1 and 8
    or p_request_notes is null or char_length(p_request_notes) > 500
    or p_origin_area_label is null or char_length(trim(p_origin_area_label)) not between 1 and 160
    or p_destination_area_label is null or char_length(trim(p_destination_area_label)) not between 1 and 160
    or p_origin_address is null or char_length(trim(p_origin_address)) not between 1 and 500
    or p_destination_address is null or char_length(trim(p_destination_address)) not between 1 and 500
  then
    raise exception 'بيانات الرحلة غير صالحة';
  end if;
  if p_origin_lat is null or p_origin_lng is null
    or p_destination_lat is null or p_destination_lng is null
    or p_origin_lat not between 22 and 31.7 or p_destination_lat not between 22 and 31.7
    or p_origin_lng not between 24.5 and 37.0 or p_destination_lng not between 24.5 and 37.0
  then
    raise exception 'موقعي البداية والوجهة يجب أن يكونا داخل مصر';
  end if;

  select count(*) into v_completed_count
  from public.trips t
  where t.requester_id = p_requester_id and t.status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from public.trips t
    where t.requester_id = p_requester_id
      and t.status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, problem_type, people_count,
    request_notes, patient_profile_id
  ) values (
    p_requester_id, trim(p_origin_area_label), trim(p_destination_area_label), p_requester_relation,
    true, v_now, p_client_ip, v_now, 'أخرى', p_people_count,
    trim(p_request_notes), p_patient_profile_id
  ) returning id into v_trip_id;

  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, trim(p_origin_address), p_origin_lat, p_origin_lng,
    trim(p_destination_address), p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

revoke all on function public.create_medical_trip_from_proxy(
  uuid, text, text, double precision, double precision,
  text, text, double precision, double precision,
  public.requester_relation, inet, timestamptz, smallint, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_medical_trip_from_proxy(
  uuid, text, text, double precision, double precision,
  text, text, double precision, double precision,
  public.requester_relation, inet, timestamptz, smallint, text, uuid
) to service_role;

-- A medical ride is a live request, not an appointment. Do not expire it
-- because its creation timestamp is now in the past by the time a volunteer
-- accepts it. Availability and the 7 km limit are checked atomically below.
create or replace function public.accept_medical_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
) returns table (
  trip_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, scheduled_at timestamptz,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision,
  distance_km double precision, people_count smallint, request_notes text,
  patient_name text, patient_phone text, patient_age integer, patient_condition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid;
  v_distance double precision;
begin
  select p.id into v_volunteer_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role = 'volunteer'::public.user_role
    and p.is_active
    and p.vehicle_data_responsibility_ack
    and p.vehicle_type is not null
    and p.vehicle_color is not null
    and p.vehicle_plate_number is not null;
  if v_volunteer_id is null then
    raise exception 'volunteer vehicle details required';
  end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
    or p_volunteer_lat not between 22 and 31.7
    or p_volunteer_lng not between 24.5 and 37.0
  then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip
  from public.trips t
  where t.id = p_trip_id
  for update;
  if not found or v_trip.status <> 'pending'::public.trip_status then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.patient_profile_id is null then
    raise exception 'medical trip not found';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l
  where l.trip_id = p_trip_id;
  if v_distance is null or v_distance > 7 then
    raise exception 'هذا الطلب خارج نطاق 7 كم من موقعك الحالي';
  end if;

  update public.trips
  set status = 'accepted'::public.trip_status,
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      volunteer_lat = p_volunteer_lat,
      volunteer_lng = p_volunteer_lng,
      accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where id = p_trip_id and status = 'pending'::public.trip_status;
  if not found then
    raise exception 'trip is no longer available';
  end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision,
    t.people_count, t.request_notes,
    pp.full_name, pp.phone_number, pp.age, pp.condition_description
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  join public.patient_profiles pp on pp.id = t.patient_profile_id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_medical_trip(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_medical_trip(uuid, double precision, double precision) to authenticated;
