-- Multi-role profiles use a generated profile id and link back to auth.users
-- through auth_user_id. Match the caller through that link before resolving
-- nearby requests, rather than assuming profiles.id equals auth.uid().
create or replace function public.get_pending_trips_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 20
)
returns table (
  id uuid,
  requester_id uuid,
  volunteer_id uuid,
  origin_area_label text,
  destination_area_label text,
  status public.trip_status,
  requester_relation public.requester_relation,
  scheduled_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  problem_type text,
  people_count smallint,
  request_notes text,
  distance_km double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = v_user_id
      and p.role = 'volunteer'::public.user_role
      and p.is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_lat is null or p_lng is null
    or p_lat not between 22 and 31.7
    or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  return query
  select t.id, t.requester_id, t.volunteer_id,
    t.origin_area_label, t.destination_area_label, t.status,
    t.requester_relation,
    t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    t.problem_type, t.people_count, t.request_notes,
    round((
      6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(l.origin_lat))
        * cos(radians(l.origin_lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(l.origin_lat))
      )))
    )::numeric, 2)::double precision as distance_km
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending'
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))) <= least(greatest(coalesce(p_radius_km, 20), 0), 20)
  order by distance_km asc, t.created_at desc;
end;
$$;
