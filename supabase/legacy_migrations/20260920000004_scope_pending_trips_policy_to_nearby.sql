-- PHASE 18 (Agent 5, follow-up) — trips_select_pending_volunteers scope fix
--
-- Documented in HANDOFF_AGENT_5.md §3 as a deferred finding: this policy let
-- any active volunteer SELECT every 'pending' row of public.trips directly
-- via PostgREST (not just through get_pending_trips_nearby()), with no 20km
-- limit — that limit was only ever enforced by the RPC/app, not the
-- database. Confirmed at the time this was not exploited by this app (which
-- only ever calls get_pending_trips_nearby()) and did not reach
-- patient_age/patient_condition (those live on profiles, separately
-- protected) or exact addresses (trip_locations has its own tighter policy).
-- It was still a real gap: "nearby only" was an app-level promise, not a
-- database-enforced one, for this access path.
--
-- Fix: the policy itself now enforces the same 20km radius, computed from
-- the volunteer's own last-reported position in volunteer_locations (the
-- same table get_pending_trips_nearby's sibling, update_volunteer_location(),
-- already writes — see 20260917000006_volunteer_locations_for_push.sql).
-- volunteer_locations has RLS enabled with NO policies and all client
-- grants revoked (by design, so no browser can read raw volunteer
-- positions), so the distance check has to run inside a SECURITY DEFINER
-- function — the exact same pattern public.is_admin() already uses in the
-- other trips_* policies below it — rather than as a raw subquery in the
-- USING clause, which would otherwise be blocked by volunteer_locations'
-- own grants for the authenticated role.
--
-- A volunteer who has never called update_volunteer_location() (no row in
-- volunteer_locations yet) now sees nothing via this direct path until they
-- have — a strictly more conservative default than "see everything", and
-- one this app is unaffected by either way, since it never uses this path
-- (it always calls the RPC, which takes the volunteer's location as a
-- parameter rather than reading volunteer_locations at all).
--
-- Nothing else changes: trips_select_own_requester, trips_select_own_volunteer
-- and trips_select_admin are untouched, so a volunteer can still see their
-- own accepted/completed trips and an admin still sees everything.

create or replace function public.volunteer_can_see_pending_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_locations l
    join public.volunteer_locations vl
      on vl.user_id = auth.uid()
    where l.trip_id = p_trip_id
      and (
        6371 * acos(
          least(
            1.0,
            greatest(
              -1.0,
              cos(radians(vl.lat))
                * cos(radians(l.origin_lat))
                * cos(radians(l.origin_lng) - radians(vl.lng))
              + sin(radians(vl.lat))
                * sin(radians(l.origin_lat))
            )
          )
        )
      ) <= 20
  );
$$;
revoke all on function public.volunteer_can_see_pending_trip(uuid)
from public, anon, authenticated;
grant execute on function public.volunteer_can_see_pending_trip(uuid)
to authenticated;
drop policy if exists trips_select_pending_volunteers on public.trips;
create policy trips_select_pending_volunteers on public.trips for select to authenticated using (
  status = 'pending'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'volunteer' and is_active
  )
  and public.volunteer_can_see_pending_trip(id)
);
