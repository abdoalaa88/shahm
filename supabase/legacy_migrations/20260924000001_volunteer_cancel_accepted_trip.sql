-- Phase 3.2: a شهم who accepted a trip had no way to back out. This reopens
-- the trip for other nearby متطوعين (fresh 15-minute window) instead of
-- leaving the requester stranded with a شهم who can no longer help.
create or replace function public.volunteer_cancel_trip(p_trip_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_volunteer_id uuid := public.my_profile_id('volunteer');
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  update public.trips
  set status = 'pending', volunteer_id = null, accepted_at = null,
      accepted_distance_km = null, expires_at = now() + interval '15 minutes'
  where id = p_trip_id and volunteer_id = v_volunteer_id and status = 'accepted';
  if not found then raise exception 'trip cannot be cancelled by this volunteer'; end if;
end;
$$;
revoke all on function public.volunteer_cancel_trip(uuid) from public, anon;
grant execute on function public.volunteer_cancel_trip(uuid) to authenticated;
