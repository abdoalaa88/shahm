-- trip_acceptance_consistency never accounted for the 'expired' status added in
-- 20260923000006, so expire_stale_trips() fails its own UPDATE with a check
-- constraint violation every time it tries to actually expire a stale trip —
-- and since get_pending_trips_nearby() calls it un-guarded via `perform`, this
-- takes down trip browsing for every volunteer as soon as any trip goes stale.
alter table public.trips drop constraint trip_acceptance_consistency;
alter table public.trips add constraint trip_acceptance_consistency check (
  (status in ('pending', 'expired') and volunteer_id is null and accepted_at is null)
  or (status in ('accepted', 'completed') and volunteer_id is not null and accepted_at is not null)
  or (status = 'cancelled')
);
