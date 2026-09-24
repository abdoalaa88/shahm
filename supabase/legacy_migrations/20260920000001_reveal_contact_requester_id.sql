-- PHASE 5 fix: reveal_contact() (used to populate the volunteer's "active
-- trip" contact card, ContactCardData in the frontend) never returned the
-- requester's profile id. As a result, when a volunteer reported the
-- requester via ReportModal, reported_profile_id was sent as null even
-- though reports.reported_profile_id is nullable and accepted it silently
-- (see HANDOFF_PHASE5.md item 3). The requester's id was always available
-- server-side (the function already joins profiles on t.requester_id) — it
-- just wasn't part of the returned table shape.
--
-- The return type is changing (a new output column), so the function must
-- be dropped and recreated rather than CREATE OR REPLACE'd in place.
drop function if exists public.reveal_contact(uuid);
create or replace function public.reveal_contact(
  p_trip_id uuid
)
returns table (
  trip_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation public.requester_relation,
  patient_age integer,
  patient_condition text,
  scheduled_at timestamptz,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision
)
language sql
security definer
set search_path = public
as $$
select
  t.id,
  p.id,
  p.first_name,
  p.phone_number,
  t.requester_relation,
  p.patient_age,
  p.patient_condition,
  t.scheduled_at,
  l.origin_address,
  l.origin_lat,
  l.origin_lng,
  l.destination_address,
  l.destination_lat,
  l.destination_lng
from trips t
join profiles p
  on p.id = t.requester_id
join trip_locations l
  on l.trip_id = t.id
where t.id = p_trip_id
  and t.volunteer_id = auth.uid()
  and t.status in ('accepted', 'completed');
$$;
revoke all on function public.reveal_contact(uuid)
from public, anon, authenticated;
grant execute on function public.reveal_contact(uuid)
to authenticated;
