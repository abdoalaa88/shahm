-- Volunteer destination filtering and pre-acceptance trip route preview.

alter table public.profiles
  add column if not exists is_online boolean not null default true,
  add column if not exists last_seen_at timestamptz;

create or replace function public.update_my_presence(p_profile_id uuid, p_is_online boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set is_online = coalesce(p_is_online, false), last_seen_at = now()
  where id = p_profile_id and auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'active profile required'; end if;
end;
$$;
revoke all on function public.update_my_presence(uuid,boolean) from public, anon;
grant execute on function public.update_my_presence(uuid,boolean) to authenticated;

create or replace function public.get_presence_counts()
returns table (shahm_count bigint, patient_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return query
  select count(*) filter (where p.role = 'volunteer'::public.user_role),
         count(*) filter (where p.role = 'requester'::public.user_role)
  from public.profiles p
  where p.is_active and p.is_online and p.last_seen_at >= now() - interval '2 minutes';
end;
$$;
revoke all on function public.get_presence_counts() from public, anon;
grant execute on function public.get_presence_counts() to authenticated;

create or replace function public.get_nearby_assistance_volunteer_ids(p_assistance_id uuid)
returns table (user_id uuid)
language sql security definer set search_path = '' as $$
  select vl.user_id
  from public.assistance_requests a
  join public.volunteer_locations vl on vl.updated_at >= now() - interval '180 minutes'
  join public.profiles p on p.id = vl.user_id
  where a.id = p_assistance_id and a.status = 'pending'
    and p.role = 'volunteer'::public.user_role and p.is_active
    and p.is_online and p.last_seen_at >= now() - interval '2 minutes'
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(vl.lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(vl.lng))
      + sin(radians(vl.lat)) * sin(radians(a.lat))
    ))) <= 7;
$$;
revoke all on function public.get_nearby_assistance_volunteer_ids(uuid) from public, anon, authenticated;
grant execute on function public.get_nearby_assistance_volunteer_ids(uuid) to service_role;

create table if not exists public.volunteer_route_preferences (
  volunteer_profile_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  destination_label text,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  updated_at timestamptz not null default now(),
  constraint volunteer_route_destination_coords check (
    (destination_lat is null and destination_lng is null)
    or (destination_lat between 22 and 31.7 and destination_lng between 24.5 and 37.0)
  ),
  constraint volunteer_route_enabled_has_destination check (
    not enabled or (destination_lat is not null and destination_lng is not null)
  )
);

alter table public.volunteer_route_preferences enable row level security;
revoke all on public.volunteer_route_preferences from public, anon;
grant select, insert, update on public.volunteer_route_preferences to authenticated;
drop policy if exists volunteer_route_preferences_select_own on public.volunteer_route_preferences;
create policy volunteer_route_preferences_select_own on public.volunteer_route_preferences
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = volunteer_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'volunteer'::public.user_role)
  );
drop policy if exists volunteer_route_preferences_insert_own on public.volunteer_route_preferences;
create policy volunteer_route_preferences_insert_own on public.volunteer_route_preferences
  for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.id = volunteer_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'volunteer'::public.user_role)
  );
drop policy if exists volunteer_route_preferences_update_own on public.volunteer_route_preferences;
create policy volunteer_route_preferences_update_own on public.volunteer_route_preferences
  for update to authenticated using (
    exists (select 1 from public.profiles p where p.id = volunteer_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'volunteer'::public.user_role)
  ) with check (
    exists (select 1 from public.profiles p where p.id = volunteer_profile_id
      and p.auth_user_id = (select auth.uid()) and p.role = 'volunteer'::public.user_role)
  );

-- Approximate route corridor: a 3 km wide straight corridor, with the request
-- pickup before the chosen destination and (for medical trips) drop-off after pickup.
create or replace function public.point_is_on_volunteer_route(
  p_start_lat double precision, p_start_lng double precision,
  p_end_lat double precision, p_end_lng double precision,
  p_point_lat double precision, p_point_lng double precision,
  p_min_along_km double precision default 0
) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_cos double precision := cos(radians(p_start_lat));
  v_dx double precision := 6371 * radians(p_end_lng - p_start_lng) * v_cos;
  v_dy double precision := 6371 * radians(p_end_lat - p_start_lat);
  v_px double precision := 6371 * radians(p_point_lng - p_start_lng) * v_cos;
  v_py double precision := 6371 * radians(p_point_lat - p_start_lat);
  v_length2 double precision;
  v_along double precision;
  v_cross_track double precision;
begin
  v_length2 := v_dx * v_dx + v_dy * v_dy;
  if v_length2 < 0.01 then return false; end if;
  v_along := (v_px * v_dx + v_py * v_dy) / sqrt(v_length2);
  v_cross_track := abs(v_px * v_dy - v_py * v_dx) / sqrt(v_length2);
  return v_along >= greatest(coalesce(p_min_along_km, 0), 0)
    and v_along <= sqrt(v_length2) and v_cross_track <= 3;
end;
$$;
revoke all on function public.point_is_on_volunteer_route(double precision,double precision,double precision,double precision,double precision,double precision,double precision) from public, anon;
grant execute on function public.point_is_on_volunteer_route(double precision,double precision,double precision,double precision,double precision,double precision,double precision) to authenticated, service_role;

create or replace function public.get_nearby_medical_trips(p_lat double precision, p_lng double precision)
returns table (
  id uuid, origin_area_label text, destination_area_label text,
  requester_relation public.requester_relation, people_count smallint,
  request_notes text, created_at timestamptz, distance_km double precision
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
    ))))::numeric, 2)::double precision
  from public.trips t join public.trip_locations l on l.trip_id = t.id
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

create or replace function public.get_nearby_captain_assistance_requests(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
) returns table (
  id uuid, issue_type text, notes text, location_label text, location_address text,
  lat double precision, lng double precision, status text, created_at timestamptz, distance_km double precision
)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_pref public.volunteer_route_preferences%rowtype;
begin
  select p.id into v_profile_id from public.profiles p
  where p.auth_user_id = auth.uid() and p.role = 'volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then raise exception 'موقعك الحالي غير صالح'; end if;
  select * into v_pref from public.volunteer_route_preferences r where r.volunteer_profile_id = v_profile_id;
  perform public.expire_stale_captain_assistance_requests();
  return query
  select a.id,a.issue_type,a.notes,a.location_label,a.location_address,a.lat,a.lng,a.status,a.created_at,
    round((6371 * acos(least(1.0,greatest(-1.0,cos(radians(p_lat))*cos(radians(a.lat))*cos(radians(a.lng)-radians(p_lng))+sin(radians(p_lat))*sin(radians(a.lat))))))::numeric,2)::double precision
  from public.captain_assistance_requests a
  where a.status='pending' and a.expires_at>now() and a.requester_profile_id<>v_profile_id
    and 6371*acos(least(1.0,greatest(-1.0,cos(radians(p_lat))*cos(radians(a.lat))*cos(radians(a.lng)-radians(p_lng))+sin(radians(p_lat))*sin(radians(a.lat))))) <= least(greatest(coalesce(p_radius_km,7),0),7)
    and (not coalesce(v_pref.enabled,false) or public.point_is_on_volunteer_route(p_lat,p_lng,v_pref.destination_lat,v_pref.destination_lng,a.lat,a.lng,0))
  order by 10 asc,a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_captain_assistance_requests(double precision,double precision,double precision) from public,anon;
grant execute on function public.get_nearby_captain_assistance_requests(double precision,double precision,double precision) to authenticated;

-- Addresses are returned only for an active volunteer's clicked, still-pending,
-- nearby medical trip; phone/patient identity data remain hidden until acceptance.
create or replace function public.get_pending_medical_trip_route(
  p_trip_id uuid, p_volunteer_lat double precision, p_volunteer_lng double precision
) returns table (origin_address text, destination_address text)
language plpgsql security definer set search_path = '' as $$
declare v_profile_id uuid; v_pref public.volunteer_route_preferences%rowtype;
begin
  select p.id into v_profile_id from public.profiles p where p.auth_user_id=auth.uid()
    and p.role='volunteer'::public.user_role and p.is_active;
  if v_profile_id is null then raise exception 'active Shahm profile required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null or p_volunteer_lat not between 22 and 31.7 or p_volunteer_lng not between 24.5 and 37 then raise exception 'موقعك الحالي غير صالح'; end if;
  select * into v_pref from public.volunteer_route_preferences r where r.volunteer_profile_id=v_profile_id;
  return query
  select l.origin_address,l.destination_address from public.trips t
    join public.trip_locations l on l.trip_id=t.id
  where t.id=p_trip_id and t.patient_profile_id is not null and t.status='pending'::public.trip_status
    and 6371*acos(least(1.0,greatest(-1.0,cos(radians(p_volunteer_lat))*cos(radians(l.origin_lat))*cos(radians(l.origin_lng)-radians(p_volunteer_lng))+sin(radians(p_volunteer_lat))*sin(radians(l.origin_lat))))) <= 7
    and (not coalesce(v_pref.enabled,false) or (
      public.point_is_on_volunteer_route(p_volunteer_lat,p_volunteer_lng,v_pref.destination_lat,v_pref.destination_lng,l.origin_lat,l.origin_lng,0)
      and public.point_is_on_volunteer_route(p_volunteer_lat,p_volunteer_lng,v_pref.destination_lat,v_pref.destination_lng,l.destination_lat,l.destination_lng,
        6371*acos(least(1.0,greatest(-1.0,cos(radians(l.origin_lat))*cos(radians(l.destination_lat))*cos(radians(l.destination_lng)-radians(l.origin_lng))+sin(radians(l.origin_lat))*sin(radians(l.destination_lat))))))
    ));
end;
$$;
revoke all on function public.get_pending_medical_trip_route(uuid,double precision,double precision) from public,anon;
grant execute on function public.get_pending_medical_trip_route(uuid,double precision,double precision) to authenticated;

-- Keep push delivery consistent with the volunteer's opted-in route filter.
create or replace function public.get_nearby_volunteer_ids(
  p_trip_id uuid, p_radius_km double precision default 20, p_max_age_minutes integer default 180
) returns table (user_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'service role required'; end if;
  return query
  select v.user_id from public.trips t
  join public.trip_locations l on l.trip_id=t.id
  join public.volunteer_locations v on v.updated_at >= now()-make_interval(mins=>greatest(coalesce(p_max_age_minutes,180),1))
  join public.profiles p on p.id=v.user_id
  left join public.volunteer_route_preferences r on r.volunteer_profile_id=p.id
  where t.id=p_trip_id and t.status='pending'::public.trip_status and p.role='volunteer'::public.user_role and p.is_active
    and p.is_online and p.last_seen_at >= now()-interval '2 minutes'
    and 6371*acos(least(1.0,greatest(-1.0,cos(radians(v.lat))*cos(radians(l.origin_lat))*cos(radians(l.origin_lng)-radians(v.lng))+sin(radians(v.lat))*sin(radians(l.origin_lat))))) <= least(greatest(coalesce(p_radius_km,20),0),20)
    and (not coalesce(r.enabled,false) or (
      public.point_is_on_volunteer_route(v.lat,v.lng,r.destination_lat,r.destination_lng,l.origin_lat,l.origin_lng,0)
      and public.point_is_on_volunteer_route(v.lat,v.lng,r.destination_lat,r.destination_lng,l.destination_lat,l.destination_lng,
        6371*acos(least(1.0,greatest(-1.0,cos(radians(l.origin_lat))*cos(radians(l.destination_lat))*cos(radians(l.destination_lng)-radians(l.origin_lng))+sin(radians(l.origin_lat))*sin(radians(l.destination_lat))))))
    ));
end;
$$;
revoke all on function public.get_nearby_volunteer_ids(uuid,double precision,integer) from public,anon,authenticated;
grant execute on function public.get_nearby_volunteer_ids(uuid,double precision,integer) to service_role;
