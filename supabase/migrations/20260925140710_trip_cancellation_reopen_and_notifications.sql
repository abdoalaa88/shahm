-- Preserve the request when a volunteer has to cancel an accepted medical trip.
-- The requester can cancel the trip; an assigned volunteer's cancellation
-- releases it back to pending so nearby volunteers can accept it.
alter table public.trips
  add column if not exists last_cancellation_actor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists last_cancellation_actor_role public.user_role,
  add column if not exists last_cancelled_at timestamptz,
  add column if not exists cancellation_event_id uuid;

create table if not exists public.trip_cancellation_notifications (
  event_id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  notification_kind text not null check (notification_kind in ('requester_cancelled', 'volunteer_cancelled')),
  created_at timestamptz not null default now()
);
alter table public.trip_cancellation_notifications enable row level security;
revoke all on public.trip_cancellation_notifications from public, anon, authenticated;
grant all on public.trip_cancellation_notifications to service_role;

drop function if exists public.cancel_medical_trip(uuid, uuid, text);
create function public.cancel_medical_trip(
  p_trip_id uuid,
  p_requester_profile_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_event_id uuid := gen_random_uuid();
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'cancellation reason required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id = p_requester_profile_id
    and p.auth_user_id = auth.uid()
    and p.role = 'requester'::public.user_role
    and p.is_active;

  if v_profile_id is null then
    raise exception 'requester role required';
  end if;

  update public.trips
  set status = 'cancelled'::public.trip_status,
      cancellation_reason = left(trim(p_reason), 500),
      last_cancellation_actor_profile_id = v_profile_id,
      last_cancellation_actor_role = 'requester'::public.user_role,
      last_cancelled_at = now(),
      cancellation_event_id = v_event_id
  where id = p_trip_id
    and requester_id = v_profile_id
    and patient_profile_id is not null
    and status in ('pending'::public.trip_status, 'accepted'::public.trip_status);

  if not found then
    raise exception 'trip cannot be cancelled';
  end if;

  return v_event_id;
end;
$$;
revoke all on function public.cancel_medical_trip(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_medical_trip(uuid, uuid, text) to authenticated;

drop function if exists public.volunteer_cancel_medical_trip(uuid, uuid, text);
create function public.volunteer_cancel_medical_trip(
  p_trip_id uuid,
  p_volunteer_profile_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_event_id uuid := gen_random_uuid();
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'cancellation reason required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id = p_volunteer_profile_id
    and p.auth_user_id = auth.uid()
    and p.role = 'volunteer'::public.user_role
    and p.is_active;

  if v_profile_id is null then
    raise exception 'volunteer role required';
  end if;

  update public.trips
  set status = 'pending'::public.trip_status,
      volunteer_id = null,
      accepted_at = null,
      accepted_distance_km = null,
      expires_at = now() + interval '15 minutes',
      cancellation_reason = left(trim(p_reason), 500),
      last_cancellation_actor_profile_id = v_profile_id,
      last_cancellation_actor_role = 'volunteer'::public.user_role,
      last_cancelled_at = now(),
      cancellation_event_id = v_event_id
  where id = p_trip_id
    and volunteer_id = v_profile_id
    and patient_profile_id is not null
    and status = 'accepted'::public.trip_status;

  if not found then
    raise exception 'trip cannot be cancelled by this volunteer';
  end if;

  return v_event_id;
end;
$$;
revoke all on function public.volunteer_cancel_medical_trip(uuid, uuid, text) from public, anon;
grant execute on function public.volunteer_cancel_medical_trip(uuid, uuid, text) to authenticated;

-- Return cancellation context with the active trip so the patient sees why a
-- previously accepted trip is pending again after a volunteer cancels it.
drop function if exists public.get_my_active_medical_trip();
create function public.get_my_active_medical_trip()
returns table (
  trip_id uuid,
  patient_profile_id uuid,
  origin_area_label text,
  destination_area_label text,
  requester_relation public.requester_relation,
  people_count smallint,
  request_notes text,
  status public.trip_status,
  created_at timestamptz,
  patient_name text,
  patient_phone text,
  patient_age integer,
  patient_condition text,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km double precision,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate_number text,
  volunteer_profile_id uuid,
  cancellation_reason text,
  last_cancellation_actor_role public.user_role,
  last_cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role = 'requester'::public.user_role
    and p.is_active;

  if v_profile_id is null then
    raise exception 'requester role required';
  end if;

  return query
  select t.id, t.patient_profile_id, t.origin_area_label, t.destination_area_label,
    t.requester_relation, t.people_count, t.request_notes, t.status, t.created_at,
    pp.full_name, pp.phone_number, pp.age, pp.condition_description,
    v.first_name, v.phone_number, t.accepted_at, t.accepted_distance_km,
    v.vehicle_type, v.vehicle_color, v.vehicle_plate_number, v.id,
    t.cancellation_reason, t.last_cancellation_actor_role, t.last_cancelled_at
  from public.trips t
  join public.patient_profiles pp on pp.id = t.patient_profile_id
  left join public.profiles v on v.id = t.volunteer_id
  where t.requester_id = v_profile_id
    and t.patient_profile_id is not null
    and t.status in ('pending'::public.trip_status, 'accepted'::public.trip_status)
  order by t.created_at desc
  limit 1;
end;
$$;
revoke all on function public.get_my_active_medical_trip() from public, anon;
grant execute on function public.get_my_active_medical_trip() to authenticated;

-- Exclude the volunteer who just cancelled from seeing/reclaiming that same
-- request, while keeping the route preference and 7 km radius filters intact.
create or replace function public.get_nearby_medical_trips(
  p_lat double precision,
  p_lng double precision
)
returns table (
  id uuid,
  origin_area_label text,
  destination_area_label text,
  requester_relation public.requester_relation,
  people_count smallint,
  request_notes text,
  created_at timestamptz,
  distance_km double precision,
  requester_id uuid,
  requester_first_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_pref public.volunteer_route_preferences%rowtype;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role = 'volunteer'::public.user_role
    and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقعك الحالي غير صالح';
  end if;
  select * into v_pref from public.volunteer_route_preferences r where r.volunteer_profile_id = v_profile_id;

  return query
  select t.id, t.origin_area_label, t.destination_area_label, t.requester_relation,
    t.people_count, t.request_notes, t.created_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))))::numeric, 2)::double precision,
    t.requester_id, requester.first_name
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  join public.profiles requester on requester.id = t.requester_id
  where t.patient_profile_id is not null
    and t.status = 'pending'::public.trip_status
    and t.expires_at > now()
    and t.last_cancellation_actor_profile_id is distinct from v_profile_id
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))) <= 7
    and (not coalesce(v_pref.enabled, false) or (
      public.point_is_on_volunteer_route(p_lat, p_lng, v_pref.destination_lat, v_pref.destination_lng, l.origin_lat, l.origin_lng, 0)
      and public.point_is_on_volunteer_route(p_lat, p_lng, v_pref.destination_lat, v_pref.destination_lng, l.destination_lat, l.destination_lng,
        6371 * acos(least(1.0, greatest(-1.0,
          cos(radians(l.origin_lat)) * cos(radians(l.destination_lat)) * cos(radians(l.destination_lng) - radians(l.origin_lng))
          + sin(radians(l.origin_lat)) * sin(radians(l.destination_lat))
        ))))
    ))
  order by 8 asc, t.created_at desc;
end;
$$;
revoke all on function public.get_nearby_medical_trips(double precision, double precision) from public, anon;
grant execute on function public.get_nearby_medical_trips(double precision, double precision) to authenticated;

notify pgrst, 'reload schema';

