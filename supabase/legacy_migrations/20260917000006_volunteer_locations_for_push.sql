-- Nearby-only push notifications.
--
-- Stores each volunteer's LAST KNOWN position server-side so send-push can notify
-- only active volunteers within 20 km of a new trip's pick-up point.
--
-- Privacy: the table has RLS enabled and NO policies, and all client privileges are
-- revoked, so no browser can read it. Volunteers can only write their own position
-- through update_volunteer_location(); only service_role can run the lookup.
--
-- Apply after 20260917000005_accept_trip_distance_and_profile_guard.sql.

create table if not exists public.volunteer_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between 22 and 31.7),
  lng double precision not null check (lng between 24.5 and 37.0),
  updated_at timestamptz not null default now()
);

alter table public.volunteer_locations enable row level security;

revoke all on public.volunteer_locations from public, anon, authenticated;
grant all on public.volunteer_locations to service_role;

-- ============================================================
-- Volunteer reports own position (called by the app)
-- ============================================================

create or replace function public.update_volunteer_location(
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from profiles
    where id = v_user_id
      and role = 'volunteer'
      and is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_lat is null
     or p_lng is null
     or p_lat not between 22 and 31.7
     or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  insert into volunteer_locations (user_id, lat, lng, updated_at)
  values (v_user_id, p_lat, p_lng, now())
  on conflict (user_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      updated_at = now();
end;
$$;

revoke all on function public.update_volunteer_location(double precision, double precision)
  from public, anon, authenticated;

grant execute on function public.update_volunteer_location(double precision, double precision)
  to authenticated;

-- ============================================================
-- Nearby volunteers for a pending trip (called by send-push only)
-- ============================================================

create or replace function public.get_nearby_volunteer_ids(
  p_trip_id uuid,
  p_radius_km double precision default 20,
  p_max_age_minutes integer default 180
)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
  select v.user_id
  from trips t
  join trip_locations l on l.trip_id = t.id
  join volunteer_locations v
    on v.updated_at >= now() - make_interval(mins => greatest(coalesce(p_max_age_minutes, 180), 1))
  join profiles p on p.id = v.user_id
  where t.id = p_trip_id
    and t.status = 'pending'
    and p.role = 'volunteer'
    and p.is_active
    and (
      6371 * acos(
        least(
          1.0,
          greatest(
            -1.0,
            cos(radians(v.lat))
            * cos(radians(l.origin_lat))
            * cos(radians(l.origin_lng) - radians(v.lng))
            + sin(radians(v.lat))
            * sin(radians(l.origin_lat))
          )
        )
      )
    ) <= least(greatest(coalesce(p_radius_km, 20), 0), 20);
end;
$$;

revoke all on function public.get_nearby_volunteer_ids(uuid, double precision, integer)
  from public, anon, authenticated;

grant execute on function public.get_nearby_volunteer_ids(uuid, double precision, integer)
  to service_role;
