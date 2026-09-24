-- PHASE 18 (Agent 5) — CRITICAL PRIVACY FIX
--
-- Known Issue #3 (flagged by Agent 3, never actually fixed by Agents 3/4):
-- public.get_pending_trips_nearby() — the volunteers' "nearby requests" feed,
-- called before a volunteer has accepted a trip — returned patient_age and
-- patient_condition in its result set. The React UI (VolunteerDashboard's
-- pending-trip cards and the pre-accept "trip details" sheet) never rendered
-- those two fields, but the values were still present in the actual
-- PostgREST/RPC HTTP response body sent to every volunteer's browser for
-- every pending trip within 20km — visible in the network tab, cacheable,
-- and readable by anyone inspecting the response regardless of what the UI
-- chooses to display. "The UI hides it" is not the same as "the API doesn't
-- send it", and per the brief this must be fixed at the database/API layer,
-- not papered over in React.
--
-- Fix: get_pending_trips_nearby() no longer selects or returns patient_age /
-- patient_condition at all. A volunteer now receives only what is actually
-- needed to decide whether to accept a pending request: area labels
-- (already pre-geocoded, non-exact), relation to the requester, schedule,
-- status/timestamps, and distance. This requires DROP + CREATE (not
-- CREATE OR REPLACE) because the return column list is shrinking, which
-- Postgres does not allow via REPLACE.
--
-- Patient age/condition are still returned by accept_trip() (this migration
-- does not touch it) and by reveal_volunteer_contact() (nor this one) —
-- i.e. AFTER a volunteer has committed to a specific trip, which matches
-- the product's own stated design ("patient age/condition shown to
-- volunteer before/after acceptance" was the bug; "after acceptance only"
-- is the fix) and is the minimum a volunteer reasonably needs once they are
-- the one on the way to help. Nothing about the post-acceptance contact
-- card, accept_trip, cancel_trip, complete_trip, or RLS changes here.

drop function if exists public.get_pending_trips_nearby(
  double precision,
  double precision,
  double precision
);
create function public.get_pending_trips_nearby(
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
  distance_km double precision
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles pr
    where pr.id = v_user_id
      and pr.role = 'volunteer'
      and pr.is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_lat is null
     or p_lng is null
     or p_lat not between 22 and 31.7
     or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  return query
  select
    t.id,
    t.requester_id,
    t.volunteer_id,
    t.origin_area_label,
    t.destination_area_label,
    t.status,
    t.requester_relation,
    t.scheduled_at,
    t.created_at,
    t.accepted_at,
    t.completed_at,
    round(
      (
        6371 * acos(
          least(
            1.0,
            greatest(
              -1.0,
              cos(radians(p_lat))
                * cos(radians(l.origin_lat))
                * cos(radians(l.origin_lng) - radians(p_lng))
              + sin(radians(p_lat))
                * sin(radians(l.origin_lat))
            )
          )
        )
      )::numeric,
      2
    )::double precision as distance_km
  from public.trips t
  join public.trip_locations l
    on l.trip_id = t.id
  where t.status = 'pending'
    and (
      6371 * acos(
        least(
          1.0,
          greatest(
            -1.0,
            cos(radians(p_lat))
              * cos(radians(l.origin_lat))
              * cos(radians(l.origin_lng) - radians(p_lng))
            + sin(radians(p_lat))
              * sin(radians(l.origin_lat))
          )
        )
      )
    ) <= least(
      greatest(coalesce(p_radius_km, 20), 0),
      20
    )
  order by distance_km asc, t.created_at desc;
end;
$$;
revoke all on function public.get_pending_trips_nearby(
  double precision,
  double precision,
  double precision
) from public, anon, authenticated;
grant execute on function public.get_pending_trips_nearby(
  double precision,
  double precision,
  double precision
) to authenticated;
