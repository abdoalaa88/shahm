-- Separate medical transport from roadside assistance for a Shahm volunteer.
-- Additive only: existing trips and profiles are preserved.

create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone_number text not null check (char_length(trim(phone_number)) between 7 and 24),
  age integer check (age between 0 and 120),
  condition_description text check (condition_description is null or char_length(condition_description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_profiles enable row level security;
grant select, insert, update, delete on public.patient_profiles to authenticated;
create policy patient_profiles_select_owner on public.patient_profiles
  for select to authenticated using (exists (
    select 1 from public.profiles p
    where p.id = patient_profiles.requester_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'requester'::public.user_role
  ));
create policy patient_profiles_insert_owner on public.patient_profiles
  for insert to authenticated with check (exists (
    select 1 from public.profiles p
    where p.id = patient_profiles.requester_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'requester'::public.user_role
  ));
create policy patient_profiles_update_owner on public.patient_profiles
  for update to authenticated using (exists (
    select 1 from public.profiles p
    where p.id = patient_profiles.requester_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'requester'::public.user_role
  )) with check (exists (
    select 1 from public.profiles p
    where p.id = patient_profiles.requester_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'requester'::public.user_role
  ));
create policy patient_profiles_delete_owner on public.patient_profiles
  for delete to authenticated using (exists (
    select 1 from public.profiles p
    where p.id = patient_profiles.requester_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'requester'::public.user_role
  ));
create index patient_profiles_owner_created_idx on public.patient_profiles (requester_profile_id, created_at desc);

alter table public.trips
  add column patient_profile_id uuid references public.patient_profiles(id) on delete set null;
create index trips_patient_profile_idx on public.trips (patient_profile_id) where patient_profile_id is not null;

create table public.captain_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id),
  issue_type text not null check (issue_type in ('عطل ميكانيكي', 'إطار مثقوب', 'نفاد الوقود', 'بطارية السيارة', 'مشكلة كهربائية', 'حادث أو طارئ', 'أخرى')),
  notes text not null default '' check (char_length(notes) <= 500),
  location_label text not null check (char_length(trim(location_label)) between 1 and 160),
  location_address text not null check (char_length(trim(location_address)) between 1 and 500),
  lat double precision not null check (lat between 22 and 31.7),
  lng double precision not null check (lng between 24.5 and 37.0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'cancelled', 'expired')),
  accepted_by_profile_id uuid references public.profiles(id),
  accepted_at timestamptz,
  accepted_distance_km double precision check (accepted_distance_km is null or accepted_distance_km between 0 and 7),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  completed_at timestamptz,
  constraint captain_assistance_acceptance_fields_check check (
    (status not in ('accepted', 'completed') or (accepted_by_profile_id is not null and accepted_at is not null))
  )
);

alter table public.captain_assistance_requests enable row level security;
grant select on public.captain_assistance_requests to authenticated;
create policy captain_assistance_select_participants on public.captain_assistance_requests
  for select to authenticated using (exists (
    select 1 from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.id in (captain_assistance_requests.requester_profile_id, captain_assistance_requests.accepted_by_profile_id)
  ));
create index captain_assistance_pending_expiry_idx on public.captain_assistance_requests (status, expires_at, created_at desc);
create index captain_assistance_requester_status_idx on public.captain_assistance_requests (requester_profile_id, status, created_at desc);
create index captain_assistance_helper_status_idx on public.captain_assistance_requests (accepted_by_profile_id, status, accepted_at desc);
alter publication supabase_realtime add table public.captain_assistance_requests;

create function public.expire_stale_captain_assistance_requests()
returns void language sql security definer set search_path = '' as $$
  update public.captain_assistance_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_stale_captain_assistance_requests() from public, anon, authenticated;
grant execute on function public.expire_stale_captain_assistance_requests() to service_role;

create function public.create_captain_assistance_request(
  p_issue_type text, p_notes text, p_location_label text, p_location_address text,
  p_lat double precision, p_lng double precision
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid;
  v_request_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_issue_type not in ('عطل ميكانيكي', 'إطار مثقوب', 'نفاد الوقود', 'بطارية السيارة', 'مشكلة كهربائية', 'حادث أو طارئ', 'أخرى') then
    raise exception 'نوع المشكلة غير صالح';
  end if;
  if p_notes is null or char_length(p_notes) > 500 then raise exception 'الملاحظات غير صالحة'; end if;
  if p_location_label is null or char_length(trim(p_location_label)) not between 1 and 160 then raise exception 'موقع العطل مطلوب'; end if;
  if p_location_address is null or char_length(trim(p_location_address)) not between 1 and 500 then raise exception 'عنوان العطل مطلوب'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقع العطل خارج النطاق المدعوم';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_profile_id::text, 0));
  perform public.expire_stale_captain_assistance_requests();
  if exists (
    select 1 from public.captain_assistance_requests a
    where a.requester_profile_id = v_profile_id and a.status in ('pending', 'accepted')
  ) then raise exception 'لديك طلب مساعدة مفتوح بالفعل'; end if;
  insert into public.captain_assistance_requests (requester_profile_id, issue_type, notes, location_label, location_address, lat, lng)
  values (v_profile_id, p_issue_type, trim(p_notes), trim(p_location_label), trim(p_location_address), p_lat, p_lng)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_captain_assistance_request(text, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.create_captain_assistance_request(text, text, text, text, double precision, double precision) to authenticated;

create function public.get_nearby_captain_assistance_requests(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
) returns table (
  id uuid, issue_type text, notes text, location_label text, location_address text,
  lat double precision, lng double precision, status text, created_at timestamptz, distance_km double precision
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقعك الحالي غير صالح';
  end if;
  perform public.expire_stale_captain_assistance_requests();
  return query
  select a.id, a.issue_type, a.notes, a.location_label, a.location_address, a.lat, a.lng, a.status, a.created_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))
    ))))::numeric, 2)::double precision
  from public.captain_assistance_requests a
  where a.status = 'pending' and a.expires_at > now() and a.requester_profile_id <> v_profile_id
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))
    ))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by 10 asc, a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_captain_assistance_requests(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_captain_assistance_requests(double precision, double precision, double precision) to authenticated;

create function public.accept_captain_assistance_request(
  p_request_id uuid, p_lat double precision, p_lng double precision
) returns table (
  request_id uuid, requester_name text, requester_phone text, issue_type text, notes text,
  location_label text, location_address text, lat double precision, lng double precision, distance_km double precision
)
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.captain_assistance_requests%rowtype;
  v_profile_id uuid;
  v_distance double precision;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active
    and p.vehicle_data_responsibility_ack and p.vehicle_type is not null
    and p.vehicle_color is not null and p.vehicle_plate_number is not null;
  if v_profile_id is null then raise exception 'بيانات الشهم والسيارة غير مكتملة'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقعك الحالي غير صالح';
  end if;
  perform public.expire_stale_captain_assistance_requests();
  select * into v_request from public.captain_assistance_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' or v_request.expires_at <= now() or v_request.requester_profile_id = v_profile_id then
    raise exception 'طلب المساعدة لم يعد متاحًا';
  end if;
  if exists (select 1 from public.captain_assistance_requests a where a.accepted_by_profile_id = v_profile_id and a.status = 'accepted') then
    raise exception 'لديك طلب مساعدة مقبول بالفعل';
  end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'طلب المساعدة خارج نطاق 7 كم'; end if;
  update public.captain_assistance_requests
    set status = 'accepted', accepted_by_profile_id = v_profile_id, accepted_at = now(),
        accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where id = p_request_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'طلب المساعدة لم يعد متاحًا'; end if;
  return query select v_request.id, p.first_name, p.phone_number, v_request.issue_type,
    v_request.notes, v_request.location_label, v_request.location_address, v_request.lat, v_request.lng,
    round(v_distance::numeric, 2)::double precision
  from public.profiles p where p.id = v_request.requester_profile_id;
end;
$$;
revoke all on function public.accept_captain_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_captain_assistance_request(uuid, double precision, double precision) to authenticated;

create function public.get_my_captain_assistance_request()
returns table (
  request_id uuid, issue_type text, notes text, location_label text, status text,
  created_at timestamptz, accepted_at timestamptz, accepted_distance_km double precision,
  helper_name text, helper_phone text, vehicle_type text, vehicle_color text, vehicle_plate_number text
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  perform public.expire_stale_captain_assistance_requests();
  return query
  select a.id, a.issue_type, a.notes, a.location_label, a.status, a.created_at, a.accepted_at,
    a.accepted_distance_km, h.first_name, h.phone_number, h.vehicle_type, h.vehicle_color, h.vehicle_plate_number
  from public.captain_assistance_requests a
  left join public.profiles h on h.id = a.accepted_by_profile_id
  where a.requester_profile_id = v_profile_id and a.status in ('pending', 'accepted')
    and (a.status = 'accepted' or a.expires_at > now())
  order by a.created_at desc limit 1;
end;
$$;
revoke all on function public.get_my_captain_assistance_request() from public, anon;
grant execute on function public.get_my_captain_assistance_request() to authenticated;

create function public.get_my_accepted_captain_assistance_request()
returns table (
  request_id uuid, requester_name text, requester_phone text, issue_type text, notes text,
  location_label text, accepted_at timestamptz, distance_km double precision
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  return query
  select a.id, p.first_name, p.phone_number, a.issue_type, a.notes, a.location_label,
    a.accepted_at, a.accepted_distance_km
  from public.captain_assistance_requests a
  join public.profiles p on p.id = a.requester_profile_id
  where a.accepted_by_profile_id = v_profile_id and a.status = 'accepted'
  order by a.accepted_at desc limit 1;
end;
$$;
revoke all on function public.get_my_accepted_captain_assistance_request() from public, anon;
grant execute on function public.get_my_accepted_captain_assistance_request() to authenticated;

create function public.cancel_captain_assistance_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  update public.captain_assistance_requests set status = 'cancelled'
  where id = p_request_id and requester_profile_id = v_profile_id and status = 'pending';
  if not found then raise exception 'لا يمكن إلغاء الطلب بعد قبوله'; end if;
end;
$$;
revoke all on function public.cancel_captain_assistance_request(uuid) from public, anon;
grant execute on function public.cancel_captain_assistance_request(uuid) to authenticated;

create function public.complete_captain_assistance_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  update public.captain_assistance_requests set status = 'completed', completed_at = now()
  where id = p_request_id and status = 'accepted'
    and (requester_profile_id = v_profile_id or accepted_by_profile_id = v_profile_id);
  if not found then raise exception 'لا يمكن إنهاء طلب المساعدة'; end if;
end;
$$;
revoke all on function public.complete_captain_assistance_request(uuid) from public, anon;
grant execute on function public.complete_captain_assistance_request(uuid) to authenticated;

-- New, separate medical-trip API. Existing RPCs remain available for old clients.
create function public.create_medical_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet, p_scheduled_at timestamptz,
  p_people_count smallint, p_request_notes text, p_patient_profile_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_trip_id uuid; v_completed_count integer;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'service role required'; end if;
  if p_requester_id is null or p_client_ip is null or p_patient_profile_id is null then
    raise exception 'requester, patient and trusted client IP are required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_requester_id and p.role = 'requester'::public.user_role and p.is_active) then
    raise exception 'requester role required';
  end if;
  if not exists (select 1 from public.patient_profiles pp where pp.id = p_patient_profile_id and pp.requester_profile_id = p_requester_id) then
    raise exception 'patient profile does not belong to requester';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '2 minutes' or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;
  if p_people_count not between 1 and 8 or p_request_notes is null or char_length(p_request_notes) > 500 then
    raise exception 'بيانات عدد الأشخاص أو الملاحظات غير صالحة';
  end if;
  select count(*) into v_completed_count from public.trips t where t.requester_id = p_requester_id and t.status = 'completed';
  if v_completed_count < 3 and exists (select 1 from public.trips t where t.requester_id = p_requester_id and t.status in ('pending', 'accepted')) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;
  insert into public.trips (requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, problem_type, people_count, request_notes, patient_profile_id)
  values (p_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, p_scheduled_at, 'أخرى', p_people_count, p_request_notes, p_patient_profile_id)
  returning id into v_trip_id;
  insert into public.trip_locations (trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng)
  values (v_trip_id, p_origin_address, p_origin_lat, p_origin_lng, p_destination_address, p_destination_lat, p_destination_lng);
  return v_trip_id;
end;
$$;
revoke all on function public.create_medical_trip_from_proxy(uuid, text, text, double precision, double precision, text, text, double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text, uuid) from public, anon, authenticated;
grant execute on function public.create_medical_trip_from_proxy(uuid, text, text, double precision, double precision, text, text, double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text, uuid) to service_role;

-- Dedicated medical-trip discovery and acceptance enforce profile ownership and 7 km.
create function public.get_nearby_medical_trips(p_lat double precision, p_lng double precision)
returns table (
  id uuid, origin_area_label text, destination_area_label text,
  requester_relation public.requester_relation, people_count smallint,
  request_notes text, created_at timestamptz, distance_km double precision
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقعك الحالي غير صالح';
  end if;
  return query
  select t.id, t.origin_area_label, t.destination_area_label, t.requester_relation, t.people_count,
    t.request_notes, t.created_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))))::numeric, 2)::double precision
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.patient_profile_id is not null and t.status = 'pending'::public.trip_status
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))) <= 7
  order by 8 asc, t.created_at desc;
end;
$$;
revoke all on function public.get_nearby_medical_trips(double precision, double precision) from public, anon;
grant execute on function public.get_nearby_medical_trips(double precision, double precision) to authenticated;

create function public.accept_medical_trip(p_trip_id uuid, p_volunteer_lat double precision, p_volunteer_lng double precision)
returns table (
  trip_id uuid, requester_first_name text, requester_phone text, requester_relation public.requester_relation,
  scheduled_at timestamptz, origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision,
  distance_km double precision, people_count smallint, request_notes text,
  patient_name text, patient_phone text, patient_age integer, patient_condition text
)
language plpgsql security definer set search_path = '' as $$
declare v_trip public.trips%rowtype; v_volunteer_id uuid; v_distance double precision;
begin
  select p.id into v_volunteer_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active
    and p.vehicle_data_responsibility_ack and p.vehicle_type is not null and p.vehicle_color is not null and p.vehicle_plate_number is not null;
  if v_volunteer_id is null then raise exception 'volunteer vehicle details required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null or p_volunteer_lat not between 22 and 31.7 or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  select * into v_trip from public.trips t where t.id = p_trip_id for update;
  if not found or v_trip.status <> 'pending'::public.trip_status then raise exception 'trip is no longer available'; end if;
  if v_trip.patient_profile_id is null then raise exception 'medical trip not found'; end if;
  if v_trip.scheduled_at < now() or v_trip.scheduled_at > now() + interval '48 hours' then raise exception 'appointment is outside the allowed time window'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance from public.trip_locations l where l.trip_id = p_trip_id;
  if v_distance is null or v_distance > 7 then raise exception 'هذا الطلب خارج نطاق 7 كم من موقعك الحالي'; end if;
  update public.trips set status = 'accepted'::public.trip_status, volunteer_id = v_volunteer_id,
    accepted_at = now(), volunteer_lat = p_volunteer_lat, volunteer_lng = p_volunteer_lng,
    accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where id = p_trip_id and status = 'pending'::public.trip_status;
  if not found then raise exception 'trip is no longer available'; end if;
  return query select t.id, p.first_name, p.phone_number, t.requester_relation, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng, l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision, t.people_count, t.request_notes,
    pp.full_name, pp.phone_number, pp.age, pp.condition_description
  from public.trips t join public.profiles p on p.id = t.requester_id join public.trip_locations l on l.trip_id = t.id
  join public.patient_profiles pp on pp.id = t.patient_profile_id
  where t.id = p_trip_id;
end;
$$;
revoke all on function public.accept_medical_trip(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_medical_trip(uuid, double precision, double precision) to authenticated;

create function public.get_my_active_medical_trip()
returns table (
  trip_id uuid, patient_profile_id uuid, origin_area_label text, destination_area_label text, requester_relation public.requester_relation,
  people_count smallint, request_notes text, status public.trip_status, created_at timestamptz,
  patient_name text, patient_phone text, patient_age integer, patient_condition text,
  volunteer_first_name text, volunteer_phone text, accepted_at timestamptz, distance_km double precision,
  vehicle_type text, vehicle_color text, vehicle_plate_number text
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.auth_user_id = auth.uid() and p.role = 'requester'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'requester role required'; end if;
  return query
  select t.id, t.patient_profile_id, t.origin_area_label, t.destination_area_label, t.requester_relation, t.people_count, t.request_notes,
    t.status, t.created_at, pp.full_name, pp.phone_number, pp.age, pp.condition_description,
    v.first_name, v.phone_number, t.accepted_at, t.accepted_distance_km,
    v.vehicle_type, v.vehicle_color, v.vehicle_plate_number
  from public.trips t join public.patient_profiles pp on pp.id = t.patient_profile_id
  left join public.profiles v on v.id = t.volunteer_id
  where t.requester_id = v_profile_id and t.patient_profile_id is not null
    and t.status in ('pending'::public.trip_status, 'accepted'::public.trip_status)
  order by t.created_at desc limit 1;
end;
$$;
revoke all on function public.get_my_active_medical_trip() from public, anon;
grant execute on function public.get_my_active_medical_trip() to authenticated;

create function public.get_my_accepted_medical_trip()
returns table (
  trip_id uuid, requester_first_name text, requester_phone text, requester_relation public.requester_relation,
  scheduled_at timestamptz, origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision,
  distance_km double precision, problem_type text, people_count smallint, request_notes text,
  patient_name text, patient_phone text, patient_age integer, patient_condition text
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  return query
  select t.id, requester.first_name, requester.phone_number, t.requester_relation, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng, l.destination_address, l.destination_lat, l.destination_lng,
    t.accepted_distance_km, t.problem_type, t.people_count, t.request_notes,
    pp.full_name, pp.phone_number, pp.age, pp.condition_description
  from public.trips t join public.profiles requester on requester.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  join public.patient_profiles pp on pp.id = t.patient_profile_id
  where t.volunteer_id = v_profile_id and t.status = 'accepted'::public.trip_status
  order by t.accepted_at desc limit 1;
end;
$$;
revoke all on function public.get_my_accepted_medical_trip() from public, anon;
grant execute on function public.get_my_accepted_medical_trip() to authenticated;

create function public.cancel_medical_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.auth_user_id = auth.uid() and p.role = 'requester'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'requester role required'; end if;
  update public.trips set status = 'cancelled'::public.trip_status
  where id = p_trip_id and requester_id = v_profile_id and patient_profile_id is not null and status = 'pending'::public.trip_status;
  if not found then raise exception 'trip cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_medical_trip(uuid) from public, anon;
grant execute on function public.cancel_medical_trip(uuid) to authenticated;

create function public.complete_medical_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.auth_user_id = auth.uid() and p.is_active and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role);
  if v_profile_id is null then raise exception 'active profile required'; end if;
  update public.trips set status = 'completed'::public.trip_status, completed_at = now()
  where id = p_trip_id and patient_profile_id is not null and status = 'accepted'::public.trip_status and v_profile_id in (requester_id, volunteer_id);
  if not found then raise exception 'trip cannot be completed'; end if;
end;
$$;
revoke all on function public.complete_medical_trip(uuid) from public, anon;
grant execute on function public.complete_medical_trip(uuid) to authenticated;
