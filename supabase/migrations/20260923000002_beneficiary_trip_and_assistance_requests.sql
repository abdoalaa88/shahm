-- Add beneficiary trip details and keep assistance requests separate from trips.

alter table public.trips
  add column if not exists passenger_count smallint not null default 1,
  add column if not exists special_notes text;

alter table public.trips drop constraint if exists trips_passenger_count_check;
alter table public.trips add constraint trips_passenger_count_check check (passenger_count between 1 and 4);
alter table public.trips drop constraint if exists trips_special_notes_length_check;
alter table public.trips add constraint trips_special_notes_length_check check (special_notes is null or char_length(special_notes) <= 500);

create table if not exists public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  issue_type text not null check (issue_type in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other')),
  description text not null check (char_length(description) between 5 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.assistance_requests enable row level security;
revoke all on public.assistance_requests from anon, authenticated;
grant all on public.assistance_requests to service_role;
grant select (scheduled_at, passenger_count, special_notes) on public.trips to authenticated;

create or replace function public.create_assistance_request(p_issue_type text, p_description text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('volunteer');
  v_request_id uuid;
begin
  if v_requester_id is null then raise exception 'volunteer role required'; end if;
  if p_issue_type not in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other') then
    raise exception 'invalid assistance issue';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 5 and 1000 then
    raise exception 'assistance description is required';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description)
  values (v_requester_id, p_issue_type, trim(p_description)) returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text) from public, anon;
grant execute on function public.create_assistance_request(text, text) to authenticated;

drop function if exists public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
);
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
  if p_scheduled_at is null or p_scheduled_at < now() or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;
  if p_passenger_count is null or p_passenger_count not between 1 and 4 then
    raise exception 'passenger count must be between 1 and 4';
  end if;
  if p_special_notes is not null and char_length(p_special_notes) > 500 then
    raise exception 'special notes are too long';
  end if;
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_profile_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, passenger_count, special_notes
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, p_scheduled_at, p_passenger_count, nullif(trim(p_special_notes), '')
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
revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text
) to service_role;

drop function if exists public.get_pending_trips_nearby(double precision, double precision, double precision);
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
  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label, t.destination_area_label,
    t.status, t.requester_relation, t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))))))::numeric, 2)::double precision,
    t.passenger_count, t.special_notes
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending' and t.scheduled_at >= now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;
revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision) to authenticated;

drop function if exists public.reveal_contact(uuid);
create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
  trip_id uuid, requester_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer, patient_condition text,
  scheduled_at timestamptz, passenger_count smallint, special_notes text,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision
)
language sql security definer set search_path = public
as $$
  select t.id, p.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at, t.passenger_count, t.special_notes,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id
    and t.volunteer_id = public.my_profile_id('volunteer')
    and t.status in ('accepted', 'completed');
$$;
revoke all on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;