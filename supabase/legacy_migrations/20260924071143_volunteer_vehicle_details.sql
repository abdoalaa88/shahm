-- Require every new volunteer to register verified vehicle details and accept
-- personal responsibility for them. Existing volunteers complete this once on
-- next sign-in; NOT VALID preserves existing rows until they are updated.
alter table public.profiles
  add column if not exists vehicle_type text,
  add column if not exists vehicle_color text,
  add column if not exists vehicle_plate_number text,
  add column if not exists vehicle_data_responsibility_ack boolean not null default false,
  add column if not exists vehicle_data_acknowledged_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_volunteer_vehicle_required;
alter table public.profiles
  add constraint profiles_volunteer_vehicle_required
  check (
    role <> 'volunteer'::public.user_role
    or (
      vehicle_type is not null and char_length(trim(vehicle_type)) between 2 and 80
      and vehicle_color is not null and char_length(trim(vehicle_color)) between 2 and 40
      and vehicle_plate_number is not null and char_length(trim(vehicle_plate_number)) between 3 and 24
      and vehicle_data_responsibility_ack
    )
  ) not valid;

-- Acceptance locks vehicle identity after the volunteer has confirmed it.
create or replace function public.guard_volunteer_vehicle_details()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role = 'volunteer'::public.user_role
      and old.vehicle_data_responsibility_ack
      and (
        new.vehicle_type is distinct from old.vehicle_type
        or new.vehicle_color is distinct from old.vehicle_color
        or new.vehicle_plate_number is distinct from old.vehicle_plate_number
        or new.vehicle_data_responsibility_ack is distinct from old.vehicle_data_responsibility_ack
      ) then
      raise exception 'volunteer vehicle details cannot be changed after registration';
    end if;

    if new.role = 'volunteer'::public.user_role and new.vehicle_data_responsibility_ack then
      new.vehicle_data_acknowledged_at := coalesce(old.vehicle_data_acknowledged_at, now());
    else
      new.vehicle_data_acknowledged_at := null;
    end if;
  elsif new.role = 'volunteer'::public.user_role and new.vehicle_data_responsibility_ack then
    new.vehicle_data_acknowledged_at := now();
  else
    new.vehicle_data_acknowledged_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_volunteer_vehicle_details() from public, anon, authenticated;
drop trigger if exists trg_guard_volunteer_vehicle_details on public.profiles;
create trigger trg_guard_volunteer_vehicle_details
before insert or update on public.profiles
for each row execute function public.guard_volunteer_vehicle_details();

-- Keep a snapshot of the helper's location and distance at the time they accept.
-- Exact coordinates remain private; requesters receive only the distance via RPC.
alter table public.trips
  add column if not exists volunteer_lat double precision,
  add column if not exists volunteer_lng double precision,
  add column if not exists accepted_distance_km double precision;

alter table public.trips
  drop constraint if exists trips_volunteer_coordinates_check;
alter table public.trips
  add constraint trips_volunteer_coordinates_check
  check (
    (volunteer_lat is null and volunteer_lng is null)
    or (
      volunteer_lat is not null and volunteer_lng is not null
      and volunteer_lat between 22 and 31.7
      and volunteer_lng between 24.5 and 37.0
    )
  ) not valid;

alter table public.trips
  drop constraint if exists trips_accepted_distance_check;
alter table public.trips
  add constraint trips_accepted_distance_check
  check (accepted_distance_km is null or accepted_distance_km between 0 and 20) not valid;

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
    or p_volunteer_lat not between 22 and 31.7
    or p_volunteer_lng not between 24.5 and 37.0 then
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
    p.patient_age, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;

-- Contact and vehicle information is returned only to the requester on an
-- accepted/completed trip. The helper's exact position is deliberately omitted.
drop function if exists public.reveal_volunteer_contact(uuid);
create function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (
  trip_id uuid,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km double precision,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, p.first_name, p.phone_number, t.accepted_at,
    t.accepted_distance_km, p.vehicle_type, p.vehicle_color, p.vehicle_plate_number
  from public.trips t
  join public.profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = auth.uid()
    and t.status in ('accepted'::public.trip_status, 'completed'::public.trip_status);
$$;

revoke all on function public.reveal_volunteer_contact(uuid) from public, anon;
grant execute on function public.reveal_volunteer_contact(uuid) to authenticated;
