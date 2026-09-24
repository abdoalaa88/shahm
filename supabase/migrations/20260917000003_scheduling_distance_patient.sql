-- Scheduling, patient profile data, and volunteer proximity controls.
-- Apply after 20260917000000_shahm_core.sql and 20260917000001_create_trip_proxy_rpc.sql.

alter table public.profiles
add column if not exists patient_age integer,
add column if not exists patient_condition text;

alter table public.profiles
drop constraint if exists profiles_patient_age_check;

alter table public.profiles
add constraint profiles_patient_age_check
check (patient_age is null or patient_age between 0 and 120);

alter table public.profiles
drop constraint if exists profiles_patient_condition_check;

alter table public.profiles
add constraint profiles_patient_condition_check
check (
patient_condition is null
or char_length(trim(patient_condition)) between 2 and 500
);

alter table public.trips
add column if not exists scheduled_at timestamptz;

-- Existing trips from the previous schema did not have appointments.
-- Keep them valid by treating their creation time as the historical schedule.
update public.trips
set scheduled_at = created_at
where scheduled_at is null;

alter table public.trips
alter column scheduled_at set not null;

alter table public.trips
drop constraint if exists trips_scheduled_at_check;

alter table public.trips
add constraint trips_scheduled_at_check
check (
scheduled_at is not null
and scheduled_at >= created_at - interval '1 minute'
);

create index if not exists idx_trips_pending_scheduled_at
on public.trips (scheduled_at)
where status = 'pending';

-- ============================================================
-- PENDING TRIPS NEARBY
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
declare
v_user_id uuid := auth.uid();
begin
if v_user_id is null then
raise exception 'authentication required';
end if;

if not exists (
select 1
from public.profiles
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

-- Volunteers must use the proximity RPC instead of broad pending-trip reads.
revoke select on public.trips from authenticated;

drop policy if exists trips_select_pending_volunteers on public.trips;

create policy trips_select_pending_volunteers
on public.trips
for select
to authenticated
using (
status = 'pending'
and false
);

grant select (
id,
requester_id,
volunteer_id,
origin_area_label,
destination_area_label,
status,
requester_relation,
created_at,
accepted_at,
completed_at,
scheduled_at
)
on public.trips
to authenticated;

revoke all on function public.get_pending_trips_nearby(
double precision,
double precision,
double precision
)
from public, anon, authenticated;

grant execute on function public.get_pending_trips_nearby(
double precision,
double precision,
double precision
)
to authenticated;

-- ============================================================
-- CREATE TRIP FROM PROXY
-- ============================================================

drop function if exists public.create_trip_from_proxy(
uuid,
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet
);

create or replace function public.create_trip_from_proxy(
p_requester_id uuid,
p_origin_area_label text,
p_origin_address text,
p_origin_lat double precision,
p_origin_lng double precision,
p_destination_area_label text,
p_destination_address text,
p_destination_lat double precision,
p_destination_lng double precision,
p_requester_relation public.requester_relation,
p_client_ip inet,
p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
v_trip_id uuid;
v_completed_count integer;
begin
if auth.role() <> 'service_role' then
raise exception 'service role required';
end if;

if p_requester_id is null
or p_client_ip is null then
raise exception 'requester and trusted client IP are required';
end if;

if not exists (
select 1
from profiles
where id = p_requester_id
and role = 'requester'
and is_active
) then
raise exception 'requester role required';
end if;

if p_scheduled_at is null
or p_scheduled_at < now()
or p_scheduled_at > now() + interval '48 hours' then
raise exception 'appointment must be within the next 48 hours';
end if;

select count(*)
into v_completed_count
from trips
where requester_id = p_requester_id
and status = 'completed';

if v_completed_count < 3
and exists (
select 1
from trips
where requester_id = p_requester_id
and status in ('pending', 'accepted')
) then
raise exception 'one open trip is allowed until three trips are completed';
end if;

insert into trips (
requester_id,
origin_area_label,
destination_area_label,
requester_relation,
good_faith_ack,
ack_at,
ack_ip,
scheduled_at
)
values (
p_requester_id,
p_origin_area_label,
p_destination_area_label,
p_requester_relation,
true,
now(),
p_client_ip,
p_scheduled_at
)
returning id into v_trip_id;

insert into trip_locations (
trip_id,
origin_address,
origin_lat,
origin_lng,
destination_address,
destination_lat,
destination_lng
)
values (
v_trip_id,
p_origin_address,
p_origin_lat,
p_origin_lng,
p_destination_address,
p_destination_lat,
p_destination_lng
);

return v_trip_id;
end;
$$;

revoke all on function public.create_trip_from_proxy(
uuid,
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet,
timestamptz
)
from public, anon, authenticated;

grant execute on function public.create_trip_from_proxy(
uuid,
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet,
timestamptz
)
to service_role;

-- ============================================================
-- DIRECT CREATE TRIP
-- ============================================================

drop function if exists public.create_trip(
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet
);

create or replace function public.create_trip(
p_origin_area_label text,
p_origin_address text,
p_origin_lat double precision,
p_origin_lng double precision,
p_destination_area_label text,
p_destination_address text,
p_destination_lat double precision,
p_destination_lng double precision,
p_requester_relation public.requester_relation,
p_client_ip inet,
p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
v_requester_id uuid := auth.uid();
v_trip_id uuid;
v_completed_count integer;
begin
if v_requester_id is null
or p_client_ip is null then
raise exception 'authentication and trusted client IP are required';
end if;

if p_scheduled_at is null
or p_scheduled_at < now()
or p_scheduled_at > now() + interval '48 hours' then
raise exception 'appointment must be within the next 48 hours';
end if;

if not exists (
select 1
from profiles
where id = v_requester_id
and role = 'requester'
and is_active
) then
raise exception 'requester role required';
end if;

select count(*)
into v_completed_count
from trips
where requester_id = v_requester_id
and status = 'completed';

if v_completed_count < 3
and exists (
select 1
from trips
where requester_id = v_requester_id
and status in ('pending', 'accepted')
) then
raise exception 'one open trip is allowed until three trips are completed';
end if;

insert into trips (
requester_id,
origin_area_label,
destination_area_label,
requester_relation,
good_faith_ack,
ack_at,
ack_ip,
scheduled_at
)
values (
v_requester_id,
p_origin_area_label,
p_destination_area_label,
p_requester_relation,
true,
now(),
p_client_ip,
p_scheduled_at
)
returning id into v_trip_id;

insert into trip_locations (
trip_id,
origin_address,
origin_lat,
origin_lng,
destination_address,
destination_lat,
destination_lng
)
values (
v_trip_id,
p_origin_address,
p_origin_lat,
p_origin_lng,
p_destination_address,
p_destination_lat,
p_destination_lng
);

return v_trip_id;
end;
$$;

revoke all on function public.create_trip(
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet,
timestamptz
)
from public, anon, authenticated;

grant execute on function public.create_trip(
text,
text,
double precision,
double precision,
text,
text,
double precision,
double precision,
public.requester_relation,
inet,
timestamptz
)
to service_role;

-- ============================================================
-- ACCEPT TRIP
-- ============================================================

drop function if exists public.accept_trip(uuid);

drop function if exists public.accept_trip(
uuid,
double precision,
double precision
);

create or replace function public.accept_trip(
p_trip_id uuid,
p_volunteer_lat double precision,
p_volunteer_lng double precision
)
returns table (
trip_id uuid,
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
destination_lng double precision,
distance_km double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
v_trip trips%rowtype;
v_volunteer_id uuid := auth.uid();
v_distance double precision;
begin
if not exists (
select 1
from profiles
where id = v_volunteer_id
and role = 'volunteer'
and is_active
) then
raise exception 'volunteer role required';
end if;

if p_volunteer_lat is null
or p_volunteer_lng is null
or p_volunteer_lat not between 22 and 31.7
or p_volunteer_lng not between 24.5 and 37.0 then
raise exception 'volunteer location must be within Egypt';
end if;

select *
into v_trip
from trips
where id = p_trip_id
for update;

if not found
or v_trip.status <> 'pending' then
raise exception 'trip is no longer available';
end if;

if v_trip.scheduled_at < now()
or v_trip.scheduled_at > now() + interval '48 hours' then
raise exception 'appointment is outside the allowed time window';
end if;

select
6371 * acos(
least(
1.0,
greatest(
-1.0,
cos(radians(p_volunteer_lat))
* cos(radians(l.origin_lat))
* cos(radians(l.origin_lng) - radians(p_volunteer_lng))
+ sin(radians(p_volunteer_lat))
* sin(radians(l.origin_lat))
)
)
)
into v_distance
from trip_locations l
where l.trip_id = p_trip_id;

if v_distance is null
or v_distance > 20 then
raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
end if;

update trips
set
status = 'accepted',
volunteer_id = v_volunteer_id,
accepted_at = now()
where id = p_trip_id
and status = 'pending';

if not found then
raise exception 'trip is no longer available';
end if;

return query
select
t.id,
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
l.destination_lng,
round(v_distance::numeric, 2)::double precision
from trips t
join profiles p
on p.id = t.requester_id
join trip_locations l
on l.trip_id = t.id
where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(
uuid,
double precision,
double precision
)
from public, anon, authenticated;

grant execute on function public.accept_trip(
uuid,
double precision,
double precision
)
to authenticated;

-- ============================================================
-- REVEAL CONTACT
-- ============================================================

drop function if exists public.reveal_contact(uuid);

create or replace function public.reveal_contact(
p_trip_id uuid
)
returns table (
trip_id uuid,
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

-- ============================================================
-- PROFILE ACCESS
-- ============================================================

grant select (
id,
first_name,
phone_number,
role,
verification_status,
is_active,
created_at,
patient_age,
patient_condition
)
on public.profiles
to authenticated;

-- ============================================================
-- PATIENT PROFILE MUTATION PROTECTION
-- ============================================================

drop trigger if exists trg_prevent_patient_profile_mutation
on public.profiles;

create or replace function public.prevent_patient_profile_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
if auth.role() <> 'service_role'
and old.id = auth.uid() then

if old.patient_age is not null
   and new.patient_age is distinct from old.patient_age then
  raise exception 'patient age can only be provided once during registration';
end if;

if old.patient_condition is not null
   and new.patient_condition is distinct from old.patient_condition then
  raise exception 'patient condition can only be provided once during registration';
end if;

end if;

return new;
end;
$$;

create trigger trg_prevent_patient_profile_mutation
before update on public.profiles
for each row
execute function public.prevent_patient_profile_mutation();

-- ============================================================
-- SAFE CLEANUP OF OBSOLETE FUNCTION SIGNATURES
-- ============================================================
-- Do not directly REVOKE a function signature that may not exist.
-- to_regprocedure() allows the migration to work on databases where
-- the legacy function was never created.

do $$
begin

if to_regprocedure(
'public.accept_trip(uuid)'
) is not null then

revoke all on function public.accept_trip(uuid)
from public, anon, authenticated;

end if;

if to_regprocedure(
'public.create_trip_from_proxy(uuid,text,text,double precision,double precision,text,text,double precision,double precision,public.requester_relation,inet)'
) is not null then

revoke all on function public.create_trip_from_proxy(
  uuid,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  double precision,
  double precision,
  public.requester_relation,
  inet
)
from public, anon, authenticated;

end if;

end
$$;