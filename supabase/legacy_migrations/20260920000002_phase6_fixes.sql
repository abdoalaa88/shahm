-- PHASE 6 bug fixes found by local/static validation. Non-destructive:
-- only CREATE OR REPLACE of two existing functions. No data is touched.
--
-- (1) get_pending_trips_nearby(): the volunteers' "nearby requests" feed.
--     The function is `language plpgsql` with RETURNS TABLE (id, requester_id,
--     volunteer_id, status, ...). In plpgsql every RETURNS TABLE column is also
--     a variable, so the unqualified `where id = v_user_id` inside the
--     role-check subquery on public.profiles is ambiguous
--     (ERROR 42702: column reference "id" is ambiguous). CREATE FUNCTION does
--     not detect this; it fails on the first CALL. Fixed by qualifying the
--     columns with an alias and, as a safety net, `#variable_conflict
--     use_column`. Logic, signature, return shape and grants are unchanged.
--     NOTE: not executed on PostgreSQL in PHASE 6 (none available) - run
--     supabase_check.sql check 16 and call the RPC once as a volunteer.
--
-- (2) prevent_profile_privilege_escalation(): profiles_update_own +
--     `grant update on profiles to authenticated` let a suspended user run
--     `update profiles set is_active = true where id = auth.uid()` and undo
--     suspend_account(). The trigger guarded role and verification_status but
--     not is_active. It now also rejects is_active changes made directly by
--     the `authenticated`/`anon` database roles. suspend_account() is
--     SECURITY DEFINER (runs as the function owner), and service_role keeps
--     its own role, so both are unaffected.

-- ============================================================
-- (1) get_pending_trips_nearby: fix ambiguous column reference
-- ============================================================
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
patient_age integer,
patient_condition text,
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
p.patient_age,
p.patient_condition,
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
join public.profiles p
on p.id = t.requester_id
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
-- ============================================================
-- (2) is_active must not be self-editable
-- ============================================================
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'role changes are managed by administrators';
  end if;
  if new.verification_status is distinct from old.verification_status and auth.role() <> 'service_role' then
    raise exception 'verification status changes are managed by administrators';
  end if;
  -- current_user is the effective database role: 'authenticated'/'anon' for a
  -- direct client UPDATE via PostgREST, the function owner inside
  -- SECURITY DEFINER RPCs such as suspend_account(), 'service_role' for the
  -- service key.
  if new.is_active is distinct from old.is_active
     and current_user in ('authenticated', 'anon') then
    raise exception 'account status changes are managed by administrators';
  end if;
  return new;
end;
$$;
