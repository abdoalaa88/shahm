-- Align the runtime functions with the multi-role profiles contract.
-- The client sends auth.users.id; trips store public.profiles.id.

create or replace function public.create_trip_from_proxy(
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
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select id into v_requester_profile_id
  from public.profiles
  where auth_user_id = p_requester_id
    and role = 'requester'
    and is_active;

  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_scheduled_at is null
     or p_scheduled_at < now()
     or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;

  select count(*) into v_completed_count
  from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from public.trips
    where requester_id = v_requester_profile_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at
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

create or replace function public.create_trip(
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
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('requester');
  v_trip_id uuid;
begin
  if v_requester_id is null or p_client_ip is null then
    raise exception 'authentication and trusted client IP are required';
  end if;
  if p_scheduled_at is null
     or p_scheduled_at < now()
     or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at
  ) values (
    v_requester_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at
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

create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
  trip_id uuid,
  requester_id uuid,
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
  destination_lng double precision
)
language sql
security definer
set search_path = public
as $$
  select t.id, p.id, p.first_name, p.phone_number, t.requester_relation,
         p.patient_age::integer, p.patient_condition, t.scheduled_at,
         l.origin_address, l.origin_lat, l.origin_lng,
         l.destination_address, l.destination_lat, l.destination_lng
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id
    and t.volunteer_id = public.my_profile_id('volunteer')
    and t.status in ('accepted', 'completed');
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) to service_role;

revoke all on function public.create_trip(
  text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) from public, anon;
grant execute on function public.create_trip(
  text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) to authenticated;

revoke all on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;