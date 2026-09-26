-- Push delivery eligibility must not depend on app presence.
-- Preserve active-volunteer, last-known-location freshness, radius, and route targeting.
create or replace function public.get_nearby_volunteer_ids(
  p_trip_id uuid,
  p_radius_km double precision default 20,
  p_max_age_minutes integer default 180
)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
  select v.user_id
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  join public.volunteer_locations v
    on v.updated_at >= now() - make_interval(mins => greatest(coalesce(p_max_age_minutes, 180), 1))
  join public.profiles p on p.id = v.user_id
  left join public.volunteer_route_preferences r on r.volunteer_profile_id = p.id
  where t.id = p_trip_id
    and t.status = 'pending'::public.trip_status
    and p.role = 'volunteer'::public.user_role
    and p.is_active
    -- Do not check p.is_online or p.last_seen_at here. Presence is only for
    -- in-app state; an opted-in device must still receive push with Shahm closed.
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(v.lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(v.lng))
      + sin(radians(v.lat)) * sin(radians(l.origin_lat))
    ))) <= least(greatest(coalesce(p_radius_km, 20), 0), 20)
    and (
      not coalesce(r.enabled, false)
      or (
        public.point_is_on_volunteer_route(
          v.lat, v.lng, r.destination_lat, r.destination_lng,
          l.origin_lat, l.origin_lng, 0
        )
        and public.point_is_on_volunteer_route(
          v.lat, v.lng, r.destination_lat, r.destination_lng,
          l.destination_lat, l.destination_lng,
          6371 * acos(least(1.0, greatest(-1.0,
            cos(radians(l.origin_lat)) * cos(radians(l.destination_lat))
            * cos(radians(l.destination_lng) - radians(l.origin_lng))
            + sin(radians(l.origin_lat)) * sin(radians(l.destination_lat))
          )))
        )
      )
    );
end;
$$;

-- The recipient resolver stays server-only.
revoke all on function public.get_nearby_volunteer_ids(uuid, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.get_nearby_volunteer_ids(uuid, double precision, integer)
  to service_role;
