-- Medical trip close/cancel authorization, no-comment ratings, and admin-only categorized reports.

alter table public.trips
  add column if not exists cancellation_reason text;

alter table public.reports
  add column if not exists category text not null default 'other',
  add column if not exists reporter_role public.user_role;

alter table public.reports
  add constraint reports_category_check check (category in (
    'plate_incorrect', 'vehicle_color_incorrect', 'harassment', 'abusive_behavior',
    'scam', 'not_eligible', 'other'
  ));

create table if not exists public.trip_ratings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rater_profile_id uuid not null references public.profiles(id),
  rated_profile_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  constraint trip_ratings_one_per_participant unique (trip_id, rater_profile_id),
  constraint trip_ratings_not_self check (rater_profile_id <> rated_profile_id)
);

alter table public.trip_ratings enable row level security;
revoke all on public.trip_ratings from anon, authenticated;
grant select on public.trip_ratings to authenticated;
create policy trip_ratings_select_admin on public.trip_ratings
  for select to authenticated using (public.is_admin());
create index if not exists trip_ratings_rated_profile_idx
  on public.trip_ratings (rated_profile_id, created_at desc);

-- The current user may read only aggregate rating data, never individual votes/comments.
create or replace function public.get_rating_summary(p_profile_id uuid)
returns table (average_rating numeric, rating_count bigint, positive_percentage numeric)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.is_active) then
    raise exception 'active profile required';
  end if;
  return query
  select coalesce(round(avg(r.stars)::numeric, 1), 5.0)::numeric,
    count(r.id),
    case when count(r.id) = 0 then null::numeric
      else round(100.0 * count(r.id) filter (where r.stars >= 4) / count(r.id), 0)::numeric end
  from public.trip_ratings r where r.rated_profile_id = p_profile_id;
end;
$$;
revoke all on function public.get_rating_summary(uuid) from public, anon;
grant execute on function public.get_rating_summary(uuid) to authenticated;

create or replace function public.rate_medical_trip(p_trip_id uuid, p_rater_profile_id uuid, p_stars smallint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rater uuid;
  v_role public.user_role;
  v_rated uuid;
begin
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'rating must be 1 to 5 stars'; end if;
  select p.id, p.role into v_rater, v_role
  from public.profiles p
  where p.id = p_rater_profile_id and p.auth_user_id = auth.uid() and p.is_active
    and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role);
  if v_rater is null then raise exception 'active trip account required'; end if;

  select case when t.requester_id = v_rater then t.volunteer_id else t.requester_id end
  into v_rated
  from public.trips t
  where t.id = p_trip_id and t.patient_profile_id is not null and t.status = 'completed'::public.trip_status
    and v_rater in (t.requester_id, t.volunteer_id)
    and ((v_role = 'requester'::public.user_role and t.requester_id = v_rater)
      or (v_role = 'volunteer'::public.user_role and t.volunteer_id = v_rater));
  if v_rated is null then raise exception 'completed trip rating not allowed'; end if;

  insert into public.trip_ratings (trip_id, rater_profile_id, rated_profile_id, stars)
  values (p_trip_id, v_rater, v_rated, p_stars);
end;
$$;
revoke all on function public.rate_medical_trip(uuid, uuid, smallint) from public, anon;
grant execute on function public.rate_medical_trip(uuid, uuid, smallint) to authenticated;

create or replace function public.get_my_trip_to_rate(p_profile_id uuid)
returns table (trip_id uuid, other_profile_id uuid, other_first_name text, completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_role public.user_role;
begin
  select p.id, p.role into v_profile_id, v_role
  from public.profiles p where p.id = p_profile_id and p.auth_user_id = auth.uid() and p.is_active
    and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role)
  limit 1;
  if v_profile_id is null then raise exception 'active trip account required'; end if;
  return query
  select t.id, other_profile.id, other_profile.first_name, t.completed_at
  from public.trips t
  join public.profiles other_profile on other_profile.id = case
    when t.requester_id = v_profile_id then t.volunteer_id else t.requester_id end
  where t.patient_profile_id is not null and t.status = 'completed'::public.trip_status
    and ((v_role = 'requester'::public.user_role and t.requester_id = v_profile_id)
      or (v_role = 'volunteer'::public.user_role and t.volunteer_id = v_profile_id))
    and not exists (select 1 from public.trip_ratings r where r.trip_id = t.id and r.rater_profile_id = v_profile_id)
  order by t.completed_at desc nulls last limit 1;
end;
$$;
revoke all on function public.get_my_trip_to_rate(uuid) from public, anon;
grant execute on function public.get_my_trip_to_rate(uuid) to authenticated;

-- Require a reason and allow only the requester to cancel a pending or accepted trip.
drop function if exists public.cancel_medical_trip(uuid);
create function public.cancel_medical_trip(p_trip_id uuid, p_requester_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'cancellation reason required'; end if;
  select p.id into v_profile_id from public.profiles p
  where p.id = p_requester_profile_id and p.auth_user_id = auth.uid()
    and p.role = 'requester'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'requester role required'; end if;
  update public.trips set status = 'cancelled'::public.trip_status,
    cancellation_reason = left(trim(p_reason), 500)
  where id = p_trip_id and requester_id = v_profile_id and patient_profile_id is not null
    and status in ('pending'::public.trip_status, 'accepted'::public.trip_status);
  if not found then raise exception 'trip cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_medical_trip(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_medical_trip(uuid, uuid, text) to authenticated;

-- A trip can be closed only by the assigned volunteer.
drop function if exists public.complete_medical_trip(uuid);
create function public.complete_medical_trip(p_trip_id uuid, p_volunteer_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.id = p_volunteer_profile_id and p.auth_user_id = auth.uid()
    and p.is_active and p.role = 'volunteer'::public.user_role;
  if v_profile_id is null then raise exception 'volunteer role required'; end if;
  update public.trips set status = 'completed'::public.trip_status, completed_at = now()
  where id = p_trip_id and patient_profile_id is not null and status = 'accepted'::public.trip_status
    and volunteer_id = v_profile_id;
  if not found then raise exception 'trip cannot be completed by this volunteer'; end if;
end;
$$;
revoke all on function public.complete_medical_trip(uuid, uuid) from public, anon;
grant execute on function public.complete_medical_trip(uuid, uuid) to authenticated;

-- Categorize reports according to the reporter's role; reports remain admin-only under existing RLS.
drop function if exists public.submit_report(uuid, uuid, text);
create function public.submit_report(p_trip_id uuid, p_reported_profile_id uuid, p_reporter_profile_id uuid, p_category text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_reporter_id uuid;
  v_reporter_role public.user_role;
  v_expected_reported_id uuid;
  v_report_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'valid report details required'; end if;
  select p.id, p.role into v_reporter_id, v_reporter_role from public.profiles p
  where p.id = p_reporter_profile_id and p.auth_user_id = auth.uid() and p.is_active
    and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role);
  if v_reporter_id is null then raise exception 'active trip account required'; end if;

  if v_reporter_role = 'volunteer'::public.user_role then
    if p_category not in ('plate_incorrect', 'vehicle_color_incorrect', 'harassment', 'abusive_behavior', 'other') then
      raise exception 'invalid volunteer report category';
    end if;
  else
    if p_category not in ('harassment', 'abusive_behavior', 'scam', 'not_eligible', 'other') then
      raise exception 'invalid patient report category';
    end if;
  end if;

  select case when t.requester_id = v_reporter_id then t.volunteer_id else t.requester_id end
  into v_expected_reported_id
  from public.trips t
  where t.id = p_trip_id and t.patient_profile_id is not null and t.status in ('accepted'::public.trip_status, 'completed'::public.trip_status)
    and v_reporter_id in (t.requester_id, t.volunteer_id);
  if v_expected_reported_id is null or p_reported_profile_id is distinct from v_expected_reported_id then
    raise exception 'report must concern the other participant in this trip';
  end if;

  insert into public.reports (reporter_id, reported_profile_id, trip_id, category, reporter_role, reason)
  values (v_reporter_id, v_expected_reported_id, p_trip_id, p_category, v_reporter_role, left(trim(p_reason), 4000))
  returning id into v_report_id;
  return v_report_id;
end;
$$;
revoke all on function public.submit_report(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_report(uuid, uuid, uuid, text, text) to authenticated;

-- Add safe requester identity to near-by requests for rating visibility before acceptance.
drop function if exists public.get_nearby_medical_trips(double precision, double precision);
create function public.get_nearby_medical_trips(p_lat double precision, p_lng double precision)
returns table (
  id uuid, origin_area_label text, destination_area_label text,
  requester_relation public.requester_relation, people_count smallint,
  request_notes text, created_at timestamptz, distance_km double precision,
  requester_id uuid, requester_first_name text
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_pref public.volunteer_route_preferences%rowtype;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'موقعك الحالي غير صالح';
  end if;
  select * into v_pref from public.volunteer_route_preferences r where r.volunteer_profile_id = v_profile_id;
  return query
  select t.id, t.origin_area_label, t.destination_area_label, t.requester_relation, t.people_count,
    t.request_notes, t.created_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))))::numeric, 2)::double precision,
    t.requester_id, requester.first_name
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  join public.profiles requester on requester.id = t.requester_id
  where t.patient_profile_id is not null and t.status = 'pending'::public.trip_status
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))) <= 7
    and (not coalesce(v_pref.enabled, false) or (
      public.point_is_on_volunteer_route(p_lat,p_lng,v_pref.destination_lat,v_pref.destination_lng,l.origin_lat,l.origin_lng,0)
      and public.point_is_on_volunteer_route(p_lat,p_lng,v_pref.destination_lat,v_pref.destination_lng,l.destination_lat,l.destination_lng,
        6371 * acos(least(1.0, greatest(-1.0, cos(radians(l.origin_lat)) * cos(radians(l.destination_lat)) * cos(radians(l.destination_lng)-radians(l.origin_lng)) + sin(radians(l.origin_lat))*sin(radians(l.destination_lat))))))
    ))
  order by 8 asc, t.created_at desc;
end;
$$;
revoke all on function public.get_nearby_medical_trips(double precision,double precision) from public, anon;
grant execute on function public.get_nearby_medical_trips(double precision,double precision) to authenticated;

-- Include the accepted volunteer's profile id with the requester's active-trip view.
drop function if exists public.get_my_active_medical_trip();
create function public.get_my_active_medical_trip()
returns table (
  trip_id uuid, patient_profile_id uuid, origin_area_label text, destination_area_label text,
  requester_relation public.requester_relation, people_count smallint, request_notes text,
  status public.trip_status, created_at timestamptz, patient_name text, patient_phone text,
  patient_age integer, patient_condition text, volunteer_first_name text, volunteer_phone text,
  accepted_at timestamptz, distance_km double precision, vehicle_type text, vehicle_color text,
  vehicle_plate_number text, volunteer_profile_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'requester'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'requester role required'; end if;
  return query
  select t.id, t.patient_profile_id, t.origin_area_label, t.destination_area_label, t.requester_relation,
    t.people_count, t.request_notes, t.status, t.created_at, pp.full_name, pp.phone_number,
    pp.age, pp.condition_description, v.first_name, v.phone_number, t.accepted_at,
    t.accepted_distance_km, v.vehicle_type, v.vehicle_color, v.vehicle_plate_number, v.id
  from public.trips t join public.patient_profiles pp on pp.id = t.patient_profile_id
  left join public.profiles v on v.id = t.volunteer_id
  where t.requester_id = v_profile_id and t.patient_profile_id is not null
    and t.status in ('pending'::public.trip_status, 'accepted'::public.trip_status)
  order by t.created_at desc limit 1;
end;
$$;
revoke all on function public.get_my_active_medical_trip() from public, anon;
grant execute on function public.get_my_active_medical_trip() to authenticated;

-- Include the requester profile id with the accepted volunteer's view for post-trip ratings.
drop function if exists public.get_my_accepted_medical_trip();
create function public.get_my_accepted_medical_trip()
returns table (
  trip_id uuid, requester_first_name text, requester_phone text, requester_relation public.requester_relation,
  scheduled_at timestamptz, origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision,
  distance_km double precision, problem_type text, people_count smallint, request_notes text,
  patient_name text, patient_phone text, patient_age integer, patient_condition text, requester_profile_id uuid
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
    pp.full_name, pp.phone_number, pp.age, pp.condition_description, requester.id
  from public.trips t join public.profiles requester on requester.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  join public.patient_profiles pp on pp.id = t.patient_profile_id
  where t.volunteer_id = v_profile_id and t.status = 'accepted'::public.trip_status
  order by t.accepted_at desc limit 1;
end;
$$;
revoke all on function public.get_my_accepted_medical_trip() from public, anon;
grant execute on function public.get_my_accepted_medical_trip() to authenticated;
