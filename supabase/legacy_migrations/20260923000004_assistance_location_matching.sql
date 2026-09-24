-- Add location-aware roadside assistance without changing trip lifecycle.

alter table public.assistance_requests
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.assistance_requests
  drop constraint if exists assistance_requests_lat_check;
alter table public.assistance_requests
  add constraint assistance_requests_lat_check check (lat between 22 and 31.7);
alter table public.assistance_requests
  drop constraint if exists assistance_requests_lng_check;
alter table public.assistance_requests
  add constraint assistance_requests_lng_check check (lng between 24.5 and 37.0);

create index if not exists idx_assistance_requests_pending_created
  on public.assistance_requests (status, created_at desc);

drop function if exists public.create_assistance_request(text, text);

create or replace function public.create_assistance_request(
  p_issue_type text,
  p_description text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql security definer set search_path = public
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
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'assistance location must be within Egypt';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description, lat, lng)
  values (v_requester_id, p_issue_type, trim(p_description), p_lat, p_lng)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text, double precision, double precision) from public, anon;
grant execute on function public.create_assistance_request(text, text, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_requests(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
)
returns table (
  id uuid,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  return query
  select a.id, a.issue_type, a.description, a.lat, a.lng,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))))))::numeric, 2)::double precision
  from public.assistance_requests a
  where a.status = 'pending'
    and a.lat is not null and a.lng is not null
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_assistance_requests(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_assistance_requests(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests set status = 'accepted'
  where id = p_assistance_id and status = 'pending';
  if not found then raise exception 'assistance request is no longer available'; end if;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_volunteer_ids(p_assistance_id uuid)
returns table (user_id uuid)
language sql security definer set search_path = public
as $$
  select vl.user_id
  from public.assistance_requests a
  join public.volunteer_locations vl on vl.updated_at >= now() - interval '180 minutes'
  join public.profiles p on p.id = vl.user_id
  where a.id = p_assistance_id
    and a.status = 'pending'
    and p.role = 'volunteer'
    and p.is_active
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(vl.lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(vl.lng))
      + sin(radians(vl.lat)) * sin(radians(a.lat))
    ))) <= 7;
$$;
revoke all on function public.get_nearby_assistance_volunteer_ids(uuid) from public, anon, authenticated;
grant execute on function public.get_nearby_assistance_volunteer_ids(uuid) to service_role;
