-- Clean Shahm baseline. Replays the reviewed application migration chain on a fresh public schema.
-- Supabase internal schemas are preserved. Existing test auth users are removed after their public profile references are removed.
drop policy if exists verification_documents_storage_insert on storage.objects;
drop policy if exists verification_documents_storage_admin_read on storage.objects;
drop policy if exists verification_documents_storage_admin_delete on storage.objects;
drop schema public cascade;
create schema public authorization pg_database_owner;
grant all on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to service_role;
delete from auth.users;

-- Source migration: 20260917000000_shahm_core.sql

-- Shahm core schema and security contract.
-- Apply locally first and review against the linked project before any remote deployment.

create extension if not exists pgcrypto;

create type public.user_role as enum (
  'volunteer', 'requester', 'ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin'
);
create type public.trip_status as enum ('pending', 'accepted', 'completed', 'cancelled');
create type public.requester_relation as enum ('patient', 'guardian', 'companion');
create type public.verification_status as enum ('unverified', 'pending_review', 'verified', 'rejected');
create type public.report_status as enum ('pending', 'reviewed', 'dismissed', 'actioned');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 2 and 40),
  phone_number text not null check (char_length(phone_number) between 7 and 32),
  role public.user_role not null,
  verification_status public.verification_status not null default 'unverified',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  volunteer_id uuid references public.profiles(id),
  origin_area_label text not null check (char_length(origin_area_label) between 1 and 160),
  destination_area_label text not null check (char_length(destination_area_label) between 1 and 160),
  status public.trip_status not null default 'pending',
  requester_relation public.requester_relation not null default 'patient',
  good_faith_ack boolean not null default false,
  ack_at timestamptz,
  ack_ip inet,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  constraint trip_requires_ack check (good_faith_ack = true),
  constraint trip_acceptance_consistency check (
    (status = 'pending' and volunteer_id is null and accepted_at is null)
    or (status in ('accepted', 'completed') and volunteer_id is not null and accepted_at is not null)
    or (status = 'cancelled')
  )
);

create table public.trip_locations (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  origin_address text not null,
  origin_lat double precision not null check (origin_lat between -90 and 90),
  origin_lng double precision not null check (origin_lng between -180 and 180),
  destination_address text not null,
  destination_lat double precision not null check (destination_lat between -90 and 90),
  destination_lng double precision not null check (destination_lng between -180 and 180)
);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  status public.verification_status not null default 'pending_review',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days')
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  reported_profile_id uuid references public.profiles(id),
  trip_id uuid references public.trips(id),
  reason text not null check (char_length(reason) between 5 and 4000),
  status public.report_status not null default 'pending',
  resolution_notes text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_profile_id uuid references public.profiles(id),
  trip_id uuid references public.trips(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_trips_pending_created_at on public.trips (created_at desc) where status = 'pending';
create index idx_trips_requester_status on public.trips (requester_id, status);
create index idx_trips_volunteer_status on public.trips (volunteer_id, status);
create index idx_trip_locations_trip_id on public.trip_locations (trip_id);
create index idx_verification_documents_profile on public.verification_documents (profile_id);
create index idx_verification_documents_purge on public.verification_documents (purge_after) where status <> 'rejected';
create index idx_reports_status_created_at on public.reports (status, created_at desc);
create index idx_audit_logs_created_at on public.audit_logs (created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin')
      and is_active
  );
$$;

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
  return new;
end;
$$;

create trigger trg_prevent_profile_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_locations enable row level security;
alter table public.verification_documents enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid() and role in ('requester', 'volunteer') and verification_status = 'unverified');
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy trips_select_pending_volunteers on public.trips for select to authenticated using (
  status = 'pending' and exists (select 1 from public.profiles where id = auth.uid() and role = 'volunteer' and is_active)
);
create policy trips_select_own_requester on public.trips for select to authenticated using (requester_id = auth.uid());
create policy trips_select_own_volunteer on public.trips for select to authenticated using (volunteer_id = auth.uid());
create policy trips_select_admin on public.trips for select to authenticated using (public.is_admin());

create policy trip_locations_select_requester on public.trip_locations for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_id and t.requester_id = auth.uid())
);
create policy trip_locations_select_assigned_volunteer on public.trip_locations for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_id and t.volunteer_id = auth.uid() and t.status in ('accepted', 'completed'))
);
create policy trip_locations_select_admin on public.trip_locations for select to authenticated using (public.is_admin());

create policy verification_documents_select_own_status on public.verification_documents for select to authenticated using (profile_id = auth.uid());
create policy verification_documents_select_admin on public.verification_documents for select to authenticated using (public.is_admin());
create policy verification_documents_insert_own on public.verification_documents for insert to authenticated with check (profile_id = auth.uid() and status = 'pending_review');

create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_select_admin on public.reports for select to authenticated using (public.is_admin());
create policy audit_logs_select_admin on public.audit_logs for select to authenticated using (public.is_admin());
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles, public.trips, public.trip_locations, public.verification_documents, public.reports, public.audit_logs, public.push_subscriptions from anon;
revoke insert, update, delete on public.trips, public.trip_locations from authenticated;
revoke update, delete on public.verification_documents from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke select on public.trips from authenticated;
grant select (id, requester_id, volunteer_id, origin_area_label, destination_area_label, status, requester_relation, created_at, accepted_at, completed_at) on public.trips to authenticated;
revoke select on public.verification_documents from authenticated;
grant select (id, profile_id, status, submitted_at, reviewed_at) on public.verification_documents to authenticated;
grant select, insert, update, delete on public.profiles, public.push_subscriptions to authenticated;
grant select on public.trip_locations, public.reports to authenticated;
grant all on all tables in schema public to service_role;

create or replace function public.create_trip(
  p_origin_area_label text, p_origin_address text, p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text, p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet
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
  if v_requester_id is null or p_client_ip is null then raise exception 'authentication and trusted client IP are required'; end if;
  if not exists (select 1 from profiles where id = v_requester_id and role = 'requester' and is_active) then raise exception 'requester role required'; end if;
  select count(*) into v_completed_count from trips where requester_id = v_requester_id and status = 'completed';
  if v_completed_count < 3 and exists (select 1 from trips where requester_id = v_requester_id and status in ('pending', 'accepted')) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into trips (requester_id, origin_area_label, destination_area_label, requester_relation, good_faith_ack, ack_at, ack_ip)
  values (v_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation, true, now(), p_client_ip)
  returning id into v_trip_id;
  insert into trip_locations (trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng)
  values (v_trip_id, p_origin_address, p_origin_lat, p_origin_lng, p_destination_address, p_destination_lat, p_destination_lng);
  return v_trip_id;
end;
$$;

create or replace function public.accept_trip(p_trip_id uuid)
returns table (trip_id uuid, requester_first_name text, requester_phone text, requester_relation public.requester_relation, origin_address text, origin_lat double precision, origin_lng double precision, destination_address text, destination_lat double precision, destination_lng double precision)
language plpgsql security definer set search_path = public
as $$
declare v_trip trips%rowtype; v_volunteer_id uuid := auth.uid();
begin
  if not exists (select 1 from profiles where id = v_volunteer_id and role = 'volunteer' and is_active) then raise exception 'volunteer role required'; end if;
  select * into v_trip from trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' then raise exception 'trip is no longer available'; end if;
  update trips set status = 'accepted', volunteer_id = v_volunteer_id, accepted_at = now() where id = p_trip_id;
  return query select t.id, p.first_name, p.phone_number, t.requester_relation, l.origin_address, l.origin_lat, l.origin_lng, l.destination_address, l.destination_lat, l.destination_lng
  from trips t join profiles p on p.id = t.requester_id join trip_locations l on l.trip_id = t.id where t.id = p_trip_id;
end;
$$;

create or replace function public.reveal_contact(p_trip_id uuid)
returns table (trip_id uuid, requester_first_name text, requester_phone text, requester_relation public.requester_relation, origin_address text, origin_lat double precision, origin_lng double precision, destination_address text, destination_lat double precision, destination_lng double precision)
language sql security definer set search_path = public
as $$
  select t.id, p.first_name, p.phone_number, t.requester_relation, l.origin_address, l.origin_lat, l.origin_lng, l.destination_address, l.destination_lat, l.destination_lng
  from trips t join profiles p on p.id = t.requester_id join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id and t.volunteer_id = auth.uid() and t.status in ('accepted', 'completed');
$$;

create or replace function public.cancel_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found or v_trip.requester_id <> auth.uid() or v_trip.status <> 'pending' then raise exception 'trip cannot be cancelled'; end if;
  update trips set status = 'cancelled' where id = p_trip_id;
end;
$$;

create or replace function public.complete_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found or auth.uid() not in (v_trip.requester_id, v_trip.volunteer_id) or v_trip.status <> 'accepted' then raise exception 'trip cannot be completed'; end if;
  update trips set status = 'completed', completed_at = now() where id = p_trip_id;
end;
$$;

create or replace function public.submit_report(p_trip_id uuid, p_reported_profile_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null or char_length(trim(p_reason)) < 5 then raise exception 'valid report required'; end if;
  insert into reports (reporter_id, trip_id, reported_profile_id, reason) values (auth.uid(), p_trip_id, p_reported_profile_id, trim(p_reason)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.suspend_account(p_target_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  update profiles set is_active = false where id = p_target_profile_id;
  insert into audit_logs (actor_id, action, target_profile_id, reason) values (auth.uid(), 'suspend_account', p_target_profile_id, p_reason);
end;
$$;

create or replace function public.get_analytics_kpis()
returns table (total_users bigint, total_volunteers bigint, total_requesters bigint, total_trips bigint, completed_trips bigint, cancelled_trips bigint, completion_rate numeric, cancellation_rate numeric)
language plpgsql security definer set search_path = public
as $$
declare v_total_trips bigint; v_completed bigint; v_cancelled bigint;
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  select count(*) into total_users from profiles;
  select count(*) into total_volunteers from profiles where role = 'volunteer';
  select count(*) into total_requesters from profiles where role = 'requester';
  select count(*) into v_total_trips from trips;
  select count(*) into v_completed from trips where status = 'completed';
  select count(*) into v_cancelled from trips where status = 'cancelled';
  total_trips := v_total_trips; completed_trips := v_completed; cancelled_trips := v_cancelled;
  completion_rate := case when v_total_trips = 0 then 0 else round((v_completed::numeric / v_total_trips) * 100, 2) end;
  cancellation_rate := case when v_total_trips = 0 then 0 else round((v_cancelled::numeric / v_total_trips) * 100, 2) end;
  return next;
end;
$$;

create or replace function public.get_geographic_distribution(p_min_threshold integer)
returns table (origin_area_label text, trip_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  return query select t.origin_area_label, count(*) from trips t group by t.origin_area_label having count(*) >= greatest(p_min_threshold, 1) order by count(*) desc;
end;
$$;

create or replace function public.get_peak_hours_distribution()
returns table (hour_of_day integer, trip_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  return query select extract(hour from t.created_at)::integer, count(*) from trips t group by extract(hour from t.created_at)::integer order by 1;
end;
$$;

revoke all on function public.create_trip(text, text, double precision, double precision, text, text, double precision, double precision, public.requester_relation, inet) from public, anon, authenticated;
grant execute on function public.create_trip(text, text, double precision, double precision, text, text, double precision, double precision, public.requester_relation, inet) to service_role;
revoke all on function public.accept_trip(uuid), public.reveal_contact(uuid), public.cancel_trip(uuid), public.complete_trip(uuid), public.submit_report(uuid, uuid, text), public.suspend_account(uuid, text) from public, anon;
grant execute on function public.accept_trip(uuid), public.reveal_contact(uuid), public.cancel_trip(uuid), public.complete_trip(uuid), public.submit_report(uuid, uuid, text), public.suspend_account(uuid, text) to authenticated;
revoke all on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() from public, anon;
grant execute on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() to authenticated;

insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do update set public = false;

create policy verification_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy verification_documents_storage_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'verification-documents' and public.is_admin());

create policy verification_documents_storage_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'verification-documents' and public.is_admin());

alter publication supabase_realtime add table public.trips;


-- Source migration: 20260917000001_create_trip_proxy_rpc.sql

-- Bridge the trusted Edge Function to create_trip semantics without exposing a
-- client-callable RPC or relying on auth.uid() from a service-role JWT.

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
  p_client_ip inet
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
  if p_requester_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if not exists (select 1 from profiles where id = p_requester_id and role = 'requester' and is_active) then
    raise exception 'requester role required';
  end if;

  select count(*) into v_completed_count
  from trips
  where requester_id = p_requester_id and status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from trips where requester_id = p_requester_id and status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip
  ) values (
    p_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip
  ) returning id into v_trip_id;

  insert into trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet
) from public, anon, authenticated;

grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet
) to service_role;


-- Source migration: 20260917000003_scheduling_distance_patient.sql

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

-- Source migration: 20260917000004_volunteer_contact.sql

-- 1. إضافة أعمدة إحداثيات نقطة الانطلاق لجدول الرحلات
alter table public.trips
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists volunteer_lat double precision,
  add column if not exists volunteer_lng double precision,
  add column if not exists accepted_distance_km double precision;

-- 2. إنشاء / تحديث دالة إظهار بيانات المتطوع وحساب المسافة
-- The immediately following migration defines the corrected Haversine implementation.


-- Source migration: 20260917000005_accept_trip_distance_and_profile_guard.sql

-- Persist accepted-trip distance, fix reveal_volunteer_contact, and correct
-- the patient-profile guard so it matches the documented Settings behavior.
-- Apply after 20260917000004_volunteer_contact.sql and before
-- 20260917000006_volunteer_locations_for_push.sql.

-- ============================================================
-- 1) accepted_distance_km: computed once at acceptance time, never
--    recomputed from a live volunteer position afterwards (raw volunteer
--    location is never stored on the trip).
-- ============================================================

alter table public.trips
  add column if not exists accepted_distance_km numeric;
alter table public.trips
  drop constraint if exists trips_accepted_distance_km_check;
alter table public.trips
  add constraint trips_accepted_distance_km_check
  check (accepted_distance_km is null or accepted_distance_km >= 0);
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
    select 1 from profiles
    where id = v_volunteer_id and role = 'volunteer' and is_active
  ) then
    raise exception 'volunteer role required';
  end if;

  if p_volunteer_lat is null
     or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from trips where id = p_trip_id for update;

  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;

  if v_trip.scheduled_at < now()
     or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
          * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
        + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
      ))
    )
  into v_distance
  from trip_locations l
  where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update trips
  set status = 'accepted',
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      accepted_distance_km = round(v_distance::numeric, 2)
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
  join profiles p on p.id = t.requester_id
  join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;
revoke all on function public.accept_trip(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision)
  to authenticated;
-- ============================================================
-- 2) reveal_volunteer_contact: the 000004 version depends on PostGIS
--    (ST_MakePoint/ST_DistanceSphere) and on trips.volunteer_lat/
--    volunteer_lng, neither of which exist anywhere in this schema, so it
--    could never actually run. Replace it with the persisted, already
--    haversine-computed accepted_distance_km — no PostGIS, no extra columns.
-- ============================================================

create or replace function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (
  trip_id uuid,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.accepted_at,
    t.accepted_distance_km
  from trips t
  join profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = auth.uid()
    and t.status in ('accepted', 'completed');
$$;
revoke all on function public.reveal_volunteer_contact(uuid)
  from public, anon, authenticated;
grant execute on function public.reveal_volunteer_contact(uuid)
  to authenticated;
-- Drop the dead, never-populated columns the broken 000004 version added
-- to trips (distinct from trip_locations.origin_lat/origin_lng, which are
-- real and stay untouched). Nothing in the frontend or Edge Functions
-- reads trips.origin_lat/origin_lng directly.
alter table public.trips drop column if exists origin_lat;
alter table public.trips drop column if exists origin_lng;
-- ============================================================
-- 3) Profile guard correction: the "once only" trigger added in 000003
--    (prevent_patient_profile_mutation) blocks the documented Settings
--    feature, where a requester can edit patient age/condition at any
--    time (see handleSaveSettings in the frontend and the README). It is
--    also not part of the approved function list in supabase_check.sql.
--    Remove it. Role/verification_status escalation protection
--    (trg_prevent_profile_privilege_escalation, from 000000) is a
--    separate trigger and is NOT touched by this migration — it remains
--    the only profile guard in force, and continues to apply on every
--    profile update including ones made from the Settings screen.
-- ============================================================

drop trigger if exists trg_prevent_patient_profile_mutation on public.profiles;
drop function if exists public.prevent_patient_profile_mutation();


-- Source migration: 20260917000006_volunteer_locations_for_push.sql

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


-- Source migration: 20260919000001_resolve_report.sql

-- Lets an admin move a report out of "pending" (reviewed / dismissed /
-- actioned) without granting any direct UPDATE on public.reports.
--
-- There is deliberately no client-facing UPDATE grant on reports (see
-- 20260917000000_shahm_core.sql: authenticated only has SELECT). All status
-- changes go through this RPC, which re-checks is_admin() itself, only
-- accepts the three terminal statuses, only transitions a report that is
-- currently 'pending', and records who reviewed it and when.
--
-- Apply this before deploying the SafetyPanel changes that call it.

alter table public.reports
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;
create or replace function public.resolve_report(
  p_report_id uuid,
  p_status public.report_status
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator role required';
  end if;

  if p_report_id is null or p_status is null then
    raise exception 'p_report_id and p_status are required';
  end if;

  if p_status not in ('reviewed', 'dismissed', 'actioned') then
    raise exception 'p_status must be reviewed, dismissed or actioned';
  end if;

  update public.reports
  set
    status = p_status,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_report_id
    and status = 'pending'
  returning * into v_report;

  if not found then
    -- Covers both "no such report" and "already resolved by someone else"
    -- (e.g. a second admin tab acting on the same report): either way there
    -- is nothing pending left to resolve, so the caller gets one clear error
    -- rather than silently succeeding or overwriting a prior decision.
    raise exception 'report not found or is not pending';
  end if;

  insert into public.audit_logs (actor_id, action, target_profile_id, trip_id, metadata)
  values (
    auth.uid(),
    'resolve_report',
    v_report.reported_profile_id,
    v_report.trip_id,
    jsonb_build_object('report_id', v_report.id, 'new_status', p_status)
  );

  return v_report;
end;
$$;
revoke all on function public.resolve_report(uuid, public.report_status) from public, anon;
grant execute on function public.resolve_report(uuid, public.report_status) to authenticated;


-- Source migration: 20260920000000_trip_accept_notifications.sql

-- PHASE 3 fix: the "notify requester once per trip acceptance, stop after
-- 15 minutes" behavior described in README/hand-offs since PHASE 2 was
-- never actually backed by a database object. This migration adds the
-- missing atomic claim table so supabase/functions/notify-trip-accepted can
-- guarantee a single push per trip even if the browser calls it more than
-- once (retry, double click, multiple tabs).
--
-- No RLS policies are added on purpose: RLS is enabled with zero grants to
-- anon/authenticated, which denies them entirely by default. Only
-- service_role (which bypasses RLS) is meant to touch this table, exactly
-- like public.volunteer_locations in 20260917000006.
--
-- Apply after 20260919000001_resolve_report.sql (this repo's migrations are
-- ordered by filename timestamp; do not renumber existing files).

create table if not exists public.trip_accept_notifications (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  notified_at timestamptz not null default now()
);
alter table public.trip_accept_notifications enable row level security;
revoke all on public.trip_accept_notifications from public, anon, authenticated;
grant all on public.trip_accept_notifications to service_role;


-- Source migration: 20260920000001_reveal_contact_requester_id.sql

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


-- Source migration: 20260920000002_phase6_fixes.sql

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


-- Source migration: 20260920000003_hide_patient_details_pre_acceptance.sql

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


-- Source migration: 20260920000004_scope_pending_trips_policy_to_nearby.sql

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


-- Source migration: 20260921092340_exclude_expired_trips_from_nearby.sql

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
    and t.scheduled_at >= now()
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
;


-- Source migration: 20260921213650_multi_role_profiles_same_email.sql

-- ============================================================
-- MULTI-ROLE PROFILES UNDER ONE AUTH IDENTITY (same Google email)
-- ============================================================

-- ============================================================
-- 1) profiles: id stops being "= auth.users.id"; auth_user_id is the
--    real link now, and (auth_user_id, role) is unique.
-- ============================================================

alter table public.profiles
  add column if not exists auth_user_id uuid;

update public.profiles set auth_user_id = id where auth_user_id is null;

alter table public.profiles
  alter column auth_user_id set not null;

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum) from pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'id'
    );

  if v_conname is not null then
    execute format('alter table public.profiles drop constraint %I', v_conname);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete cascade;

alter table public.profiles
  alter column id set default gen_random_uuid();

alter table public.profiles
  add constraint profiles_auth_user_id_role_unique unique (auth_user_id, role);

create index if not exists idx_profiles_auth_user_id on public.profiles (auth_user_id);

-- ============================================================
-- 2) Helper: "my profile id for role X"
-- ============================================================

create or replace function public.my_profile_id(p_role public.user_role)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where auth_user_id = auth.uid()
    and role = p_role
    and is_active
  limit 1;
$$;

revoke all on function public.my_profile_id(public.user_role) from public, anon;
grant execute on function public.my_profile_id(public.user_role) to authenticated;

-- ============================================================
-- 3) is_admin(): ownership-based
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role in ('ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin')
      and is_active
  );
$$;

-- ============================================================
-- 4) profiles RLS
-- ============================================================

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and role in ('requester', 'volunteer')
    and verification_status = 'unverified'
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ============================================================
-- 5) trips / trip_locations RLS
-- ============================================================

drop policy if exists trips_select_pending_volunteers on public.trips;
drop policy if exists trips_select_own_requester on public.trips;
drop policy if exists trips_select_own_volunteer on public.trips;

create policy trips_select_pending_volunteers on public.trips for select to authenticated using (
  status = 'pending'
  and public.my_profile_id('volunteer') is not null
  and public.volunteer_can_see_pending_trip(id)
);
create policy trips_select_own_requester on public.trips for select to authenticated using (
  requester_id in (select id from public.profiles where auth_user_id = auth.uid())
);
create policy trips_select_own_volunteer on public.trips for select to authenticated using (
  volunteer_id in (select id from public.profiles where auth_user_id = auth.uid())
);

drop policy if exists trip_locations_select_requester on public.trip_locations;
drop policy if exists trip_locations_select_assigned_volunteer on public.trip_locations;

create policy trip_locations_select_requester on public.trip_locations for select to authenticated using (
  exists (
    select 1 from public.trips t
    where t.id = trip_id
      and t.requester_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
);
create policy trip_locations_select_assigned_volunteer on public.trip_locations for select to authenticated using (
  exists (
    select 1 from public.trips t
    where t.id = trip_id
      and t.volunteer_id in (select id from public.profiles where auth_user_id = auth.uid())
      and t.status in ('accepted', 'completed')
  )
);

-- ============================================================
-- 6) verification_documents / reports / push_subscriptions RLS
-- ============================================================

drop policy if exists verification_documents_select_own_status on public.verification_documents;
drop policy if exists verification_documents_insert_own on public.verification_documents;

create policy verification_documents_select_own_status on public.verification_documents for select to authenticated using (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
);
create policy verification_documents_insert_own on public.verification_documents for insert to authenticated with check (
  profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  and status = 'pending_review'
);

drop policy if exists reports_insert_own on public.reports;

create policy reports_insert_own on public.reports for insert to authenticated with check (
  reporter_id in (select id from public.profiles where auth_user_id = auth.uid())
);

drop policy if exists push_subscriptions_own on public.push_subscriptions;

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (
  user_id in (select id from public.profiles where auth_user_id = auth.uid())
) with check (
  user_id in (select id from public.profiles where auth_user_id = auth.uid())
);

-- ============================================================
-- 7) Trip-lifecycle RPCs
-- ============================================================

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
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then
    raise exception 'volunteer role required';
  end if;

  if p_volunteer_lat is null
     or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from trips where id = p_trip_id for update;

  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;

  if v_trip.scheduled_at < now()
     or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
          * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
        + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
      ))
    )
  into v_distance
  from trip_locations l
  where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update trips
  set status = 'accepted',
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      accepted_distance_km = round(v_distance::numeric, 2)
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
  join profiles p on p.id = t.requester_id
  join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

create or replace function public.reveal_contact(p_trip_id uuid)
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
  select t.id, p.id, p.first_name, p.phone_number, t.requester_relation,
         p.patient_age, p.patient_condition, t.scheduled_at,
         l.origin_address, l.origin_lat, l.origin_lng,
         l.destination_address, l.destination_lat, l.destination_lng
  from trips t
  join profiles p on p.id = t.requester_id
  join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id
    and t.volunteer_id = public.my_profile_id('volunteer')
    and t.status in ('accepted', 'completed');
$$;

-- cancel_trip: the currently deployed version returns boolean, but every
-- committed migration (including this one) has always defined it as
-- returns void, and the client never reads a return value from it
-- (supabase.rpc('cancel_trip', ...) only destructures { error }). Drop the
-- drifted boolean version so CREATE OR REPLACE below can proceed.
drop function if exists public.cancel_trip(uuid);

create or replace function public.cancel_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip_id for update;

  if not found
     or v_trip.requester_id is distinct from public.my_profile_id('requester')
     or v_trip.status <> 'pending' then
    raise exception 'trip cannot be cancelled';
  end if;

  update trips set status = 'cancelled' where id = p_trip_id;
end;
$$;

create or replace function public.complete_trip(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip_id for update;

  if not found
     or v_trip.status <> 'accepted'
     or not exists (
       select 1 from profiles
       where auth_user_id = auth.uid()
         and id in (v_trip.requester_id, v_trip.volunteer_id)
     )
  then
    raise exception 'trip cannot be completed';
  end if;

  update trips set status = 'completed', completed_at = now() where id = p_trip_id;
end;
$$;

-- ============================================================
-- 8) submit_report
-- ============================================================

create or replace function public.submit_report(p_trip_id uuid, p_reported_profile_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_reporter_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'valid report required';
  end if;

  select id into v_reporter_id
  from profiles
  where auth_user_id = auth.uid()
    and id in (
      select requester_id from trips where id = p_trip_id
      union
      select volunteer_id from trips where id = p_trip_id
    )
  limit 1;

  if v_reporter_id is null then
    select id into v_reporter_id
    from profiles
    where auth_user_id = auth.uid()
      and role in ('requester', 'volunteer')
    limit 1;
  end if;

  if v_reporter_id is null then
    raise exception 'valid report required';
  end if;

  insert into reports (reporter_id, trip_id, reported_profile_id, reason)
  values (v_reporter_id, p_trip_id, p_reported_profile_id, trim(p_reason))
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- 9) suspend_account / resolve_report
-- ============================================================

create or replace function public.suspend_account(p_target_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  if not public.is_admin() then
    raise exception 'administrator role required';
  end if;

  select id into v_actor_id
  from profiles
  where auth_user_id = auth.uid()
    and role in ('ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin')
    and is_active
  limit 1;

  update profiles set is_active = false where id = p_target_profile_id;

  insert into audit_logs (actor_id, action, target_profile_id, reason)
  values (v_actor_id, 'suspend_account', p_target_profile_id, p_reason);
end;
$$;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_status public.report_status
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
  v_actor_id uuid;
begin
  if not public.is_admin() then
    raise exception 'administrator role required';
  end if;

  if p_report_id is null or p_status is null then
    raise exception 'p_report_id and p_status are required';
  end if;

  if p_status not in ('reviewed', 'dismissed', 'actioned') then
    raise exception 'p_status must be reviewed, dismissed or actioned';
  end if;

  select id into v_actor_id
  from public.profiles
  where auth_user_id = auth.uid()
    and role in ('ops_admin', 'verification_admin', 'analytics_viewer', 'super_admin')
    and is_active
  limit 1;

  update public.reports
  set
    status = p_status,
    reviewed_by = v_actor_id,
    reviewed_at = now()
  where id = p_report_id
    and status = 'pending'
  returning * into v_report;

  if not found then
    raise exception 'report not found or is not pending';
  end if;

  insert into public.audit_logs (actor_id, action, target_profile_id, trip_id, metadata)
  values (
    v_actor_id,
    'resolve_report',
    v_report.reported_profile_id,
    v_report.trip_id,
    jsonb_build_object('report_id', v_report.id, 'new_status', p_status)
  );

  return v_report;
end;
$$;

-- ============================================================
-- 10) get_pending_trips_nearby / volunteer_can_see_pending_trip /
--     update_volunteer_location
-- ============================================================

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
      on vl.user_id = public.my_profile_id('volunteer')
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
  distance_km double precision
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if public.my_profile_id('volunteer') is null then
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
    and t.scheduled_at >= now()
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
  v_profile_id uuid := public.my_profile_id('volunteer');
begin
  if v_profile_id is null then
    raise exception 'volunteer role required';
  end if;

  if p_lat is null
     or p_lng is null
     or p_lat not between 22 and 31.7
     or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  insert into volunteer_locations (user_id, lat, lng, updated_at)
  values (v_profile_id, p_lat, p_lng, now())
  on conflict (user_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      updated_at = now();
end;
$$;
;


-- Source migration: 20260921213714_restore_missing_analytics_functions.sql

-- These three admin-analytics RPCs are defined in the very first migration
-- (20260917000000_shahm_core.sql) and are recorded as applied, but were
-- absent from this database before this fix (confirmed via pg_proc) --
-- pre-existing drift between migration history and actual schema, unrelated
-- to the multi-role change. Their logic only gates on is_admin() and never
-- assumed profiles.id = auth.uid(), so they're safe to add unmodified.
-- src/components/admin/AnalyticsDashboard.tsx calls all three directly.

create or replace function public.get_analytics_kpis()
returns table (total_users bigint, total_volunteers bigint, total_requesters bigint, total_trips bigint, completed_trips bigint, cancelled_trips bigint, completion_rate numeric, cancellation_rate numeric)
language plpgsql security definer set search_path = public
as $$
declare v_total_trips bigint; v_completed bigint; v_cancelled bigint;
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  select count(*) into total_users from profiles;
  select count(*) into total_volunteers from profiles where role = 'volunteer';
  select count(*) into total_requesters from profiles where role = 'requester';
  select count(*) into v_total_trips from trips;
  select count(*) into v_completed from trips where status = 'completed';
  select count(*) into v_cancelled from trips where status = 'cancelled';
  total_trips := v_total_trips; completed_trips := v_completed; cancelled_trips := v_cancelled;
  completion_rate := case when v_total_trips = 0 then 0 else round((v_completed::numeric / v_total_trips) * 100, 2) end;
  cancellation_rate := case when v_total_trips = 0 then 0 else round((v_cancelled::numeric / v_total_trips) * 100, 2) end;
  return next;
end;
$$;

create or replace function public.get_geographic_distribution(p_min_threshold integer)
returns table (origin_area_label text, trip_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  return query select t.origin_area_label, count(*) from trips t group by t.origin_area_label having count(*) >= greatest(p_min_threshold, 1) order by count(*) desc;
end;
$$;

create or replace function public.get_peak_hours_distribution()
returns table (hour_of_day integer, trip_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'administrator role required'; end if;
  return query select extract(hour from t.created_at)::integer, count(*) from trips t group by extract(hour from t.created_at)::integer order by 1;
end;
$$;

revoke all on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() from public, anon;
grant execute on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() to authenticated;

-- reveal_volunteer_contact still matched the trip's requester via raw
-- auth.uid() = profiles.id, an assumption the multi-role migration broke:
-- a person's SECOND profile (any role created after their first) gets a
-- fresh generated id that is no longer equal to auth.uid(). Bring it in
-- line with every other RPC this migration touched.
create or replace function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (trip_id uuid, volunteer_first_name text, volunteer_phone text, accepted_at timestamptz, distance_km numeric)
language sql
stable security definer
set search_path = public
as $$
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.accepted_at,
    t.accepted_distance_km
  from trips t
  join profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = public.my_profile_id('requester')
    and t.status in ('accepted', 'completed');
$$;
;


-- Source migration: 20260921213813_fix_grants_and_drop_stale_overload.sql

-- (a) cancel_trip, is_admin, submit_report, suspend_account all had to be
-- freshly created by the previous migration (they did not exist in this
-- database before), so CREATE OR REPLACE could not carry forward the
-- REVOKE-from-anon/PUBLIC that every other SECURITY DEFINER function here
-- has. Postgres grants PUBLIC execute by default on a newly created
-- function, so without this they'd be callable by anonymous/unauthenticated
-- requests. Match the same authenticated-only contract every sibling RPC
-- already has.
revoke all on function public.cancel_trip(uuid) from public, anon;
grant execute on function public.cancel_trip(uuid) to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.submit_report(uuid, uuid, text) from public, anon;
grant execute on function public.submit_report(uuid, uuid, text) to authenticated;

revoke all on function public.suspend_account(uuid, text) from public, anon;
grant execute on function public.suspend_account(uuid, text) to authenticated;

-- (b) create_trip_from_proxy(...) without p_scheduled_at is dead: the only
-- caller (supabase/functions/create-trip-proxy/index.ts) always passes
-- p_scheduled_at and has done since the scheduling migration. Leaving both
-- overloads in place is exactly what supabase_check.sql check 3 flags as
-- unsafe drift.
drop function if exists public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision,
  text, text, double precision, double precision,
  public.requester_relation, inet
);
;


-- Source migration: 20260921213843_attach_missing_profile_privilege_escalation_trigger.sql

-- Critical pre-existing gap, unrelated to the multi-role migration: the
-- public.prevent_profile_privilege_escalation() function existed, but no
-- trigger on public.profiles ever called it. Every migration file since
-- shahm_core.sql assumes this trigger is active (phase6_fixes.sql's own
-- comment describes exactly the self-unsuspend attack this prevents), and
-- supabase_check.sql check 8 expects it to exist -- it was simply never
-- created in this database. Without it, profiles_update_own (auth_user_id =
-- auth.uid()) lets any authenticated user directly UPDATE their own role,
-- verification_status, or is_active via PostgREST -- i.e. self-promote to
-- super_admin or un-suspend themselves.
drop trigger if exists trg_prevent_profile_privilege_escalation on public.profiles;

create trigger trg_prevent_profile_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();
;


-- Source migration: 20260921222254_revoke_stale_update_grant_on_reports.sql

-- The 2026-09-19 resolve_report migration documented "no client-facing
-- UPDATE grant on reports" as a deliberate design decision (all status
-- changes must go through the resolve_report() SECURITY DEFINER RPC),
-- but never actually revoked the UPDATE privilege that Postgres/Supabase
-- grants to `authenticated` by default when the table was first created.
-- RLS already has no UPDATE policy on reports, so this was not directly
-- exploitable, but tightening the grant to match the documented intent
-- is correct defense-in-depth.
revoke update on public.reports from authenticated;;


-- Source migration: 20260922105808_fix_patient_age_smallint_return_type_mismatch.sql

-- profiles.patient_age is smallint in this database (not integer as the
-- original migrations assumed). accept_trip() declares patient_age as
-- integer in its RETURNS TABLE and uses RETURN QUERY (plpgsql), which
-- requires an exact type match (not just an implicit cast) between the
-- query's column types and the declared OUT types. The smallint/integer
-- mismatch was throwing Postgres error 42804 (datatype mismatch) on every
-- accept_trip call, AFTER the trip had already been updated to 'accepted'
-- inside the same function — so the UPDATE succeeded but the caller only
-- ever saw a generic failure, and the trip was silently already taken.
-- Fix: cast patient_age to integer explicitly in both functions that
-- return it.

create or replace function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table(
  trip_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation requester_relation,
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
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then
    raise exception 'volunteer role required';
  end if;

  if p_volunteer_lat is null
     or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from trips where id = p_trip_id for update;

  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;

  if v_trip.scheduled_at + interval '1 hour' < now() then
    raise exception 'انتهت مهلة هذا الطلب';
  end if;

  select
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
          * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
        + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
      ))
    )
  into v_distance
  from trip_locations l
  where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 10 then
    raise exception 'هذا الطلب خارج نطاق 10 كم من موقعك الحالي';
  end if;

  update trips
  set status = 'accepted',
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      accepted_distance_km = round(v_distance::numeric, 2)
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
    p.patient_age::integer,
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
  join profiles p on p.id = t.requester_id
  join trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
  trip_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation requester_relation,
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
  p.patient_age::integer,
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
;


-- Source migration: 20260923000000_fix_runtime_profile_and_trip_contracts.sql

-- Align the runtime functions with the multi-role profiles contract.
-- The client sends auth.users.id; trips store public.profiles.id.

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
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select id into v_requester_profile_id
  from public.profiles
  where auth_user_id = p_requester_id
    and role = 'requester'
    and is_active;

  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_scheduled_at is null
     or p_scheduled_at < now()
     or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;

  select count(*) into v_completed_count
  from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from public.trips
    where requester_id = v_requester_profile_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at
  ) returning id into v_trip_id;

  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

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
  v_requester_id uuid := public.my_profile_id('requester');
  v_trip_id uuid;
begin
  if v_requester_id is null or p_client_ip is null then
    raise exception 'authentication and trusted client IP are required';
  end if;
  if p_scheduled_at is null
     or p_scheduled_at < now()
     or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at
  ) values (
    v_requester_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at
  ) returning id into v_trip_id;

  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
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
  select t.id, p.id, p.first_name, p.phone_number, t.requester_relation,
         p.patient_age::integer, p.patient_condition, t.scheduled_at,
         l.origin_address, l.origin_lat, l.origin_lng,
         l.destination_address, l.destination_lat, l.destination_lng
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id
    and t.volunteer_id = public.my_profile_id('volunteer')
    and t.status in ('accepted', 'completed');
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) to service_role;

revoke all on function public.create_trip(
  text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) from public, anon;
grant execute on function public.create_trip(
  text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
) to authenticated;

revoke all on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;

-- Source migration: 20260923000001_limit_trip_distance_to_7km.sql

-- Enforce the current 7km service radius server-side without exposing the value in UI.

create or replace function public.get_pending_trips_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
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
begin
  if public.my_profile_id('volunteer') is null then
    raise exception 'volunteer role required';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between 22 and 31.7
     or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label,
    t.destination_area_label, t.status, t.requester_relation, t.scheduled_at,
    t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    ))))::numeric, 2)::double precision
  from public.trips t
  join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending'
    and t.scheduled_at >= now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat))
      * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))
    )))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;

create or replace function public.volunteer_can_see_pending_trip(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_locations l
    join public.volunteer_locations vl on vl.user_id = public.my_profile_id('volunteer')
    where l.trip_id = p_trip_id
      and 6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(vl.lat)) * cos(radians(l.origin_lat))
        * cos(radians(l.origin_lng) - radians(vl.lng))
        + sin(radians(vl.lat)) * sin(radians(l.origin_lat))
      ))) <= 7
  );
$$;

create or replace function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table (
  trip_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer,
  patient_condition text, scheduled_at timestamptz,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision,
  destination_lng double precision, distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.scheduled_at + interval '1 hour' < now() then
    raise exception 'انتهت مهلة هذا الطلب';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 7 then
    raise exception 'هذا الطلب خارج النطاق المتاح';
  end if;

  update public.trips set status = 'accepted', volunteer_id = v_volunteer_id,
    accepted_at = now(), accepted_distance_km = round(v_distance::numeric, 2)
  where id = p_trip_id and status = 'pending';
  if not found then raise exception 'trip is no longer available'; end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision), public.volunteer_can_see_pending_trip(uuid) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision), public.volunteer_can_see_pending_trip(uuid) to authenticated;
revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;


-- Source migration: 20260923000002_beneficiary_trip_and_assistance_requests.sql

-- Add beneficiary trip details and keep assistance requests separate from trips.

alter table public.trips
  add column if not exists passenger_count smallint not null default 1,
  add column if not exists special_notes text;

alter table public.trips drop constraint if exists trips_passenger_count_check;
alter table public.trips add constraint trips_passenger_count_check check (passenger_count between 1 and 4);
alter table public.trips drop constraint if exists trips_special_notes_length_check;
alter table public.trips add constraint trips_special_notes_length_check check (special_notes is null or char_length(special_notes) <= 500);

create table if not exists public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  issue_type text not null check (issue_type in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other')),
  description text not null check (char_length(description) between 5 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.assistance_requests enable row level security;
revoke all on public.assistance_requests from anon, authenticated;
grant all on public.assistance_requests to service_role;
grant select (scheduled_at, passenger_count, special_notes) on public.trips to authenticated;

create or replace function public.create_assistance_request(p_issue_type text, p_description text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('volunteer');
  v_request_id uuid;
begin
  if v_requester_id is null then raise exception 'volunteer role required'; end if;
  if p_issue_type not in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other') then
    raise exception 'invalid assistance issue';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 5 and 1000 then
    raise exception 'assistance description is required';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description)
  values (v_requester_id, p_issue_type, trim(p_description)) returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text) from public, anon;
grant execute on function public.create_assistance_request(text, text) to authenticated;

drop function if exists public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
);
create or replace function public.create_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz, p_passenger_count smallint default 1,
  p_special_notes text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_requester_profile_id from public.profiles
  where auth_user_id = p_requester_id and role = 'requester' and is_active;
  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;
  if p_passenger_count is null or p_passenger_count not between 1 and 4 then
    raise exception 'passenger count must be between 1 and 4';
  end if;
  if p_special_notes is not null and char_length(p_special_notes) > 500 then
    raise exception 'special notes are too long';
  end if;
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_profile_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, passenger_count, special_notes
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, p_scheduled_at, p_passenger_count, nullif(trim(p_special_notes), '')
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;
revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text
) to service_role;

drop function if exists public.get_pending_trips_nearby(double precision, double precision, double precision);
create or replace function public.get_pending_trips_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
)
returns table (
  id uuid, requester_id uuid, volunteer_id uuid, origin_area_label text, destination_area_label text,
  status public.trip_status, requester_relation public.requester_relation, scheduled_at timestamptz,
  created_at timestamptz, accepted_at timestamptz, completed_at timestamptz,
  distance_km double precision, passenger_count smallint, special_notes text
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label, t.destination_area_label,
    t.status, t.requester_relation, t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))))))::numeric, 2)::double precision,
    t.passenger_count, t.special_notes
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending' and t.scheduled_at >= now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;
revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision) to authenticated;

drop function if exists public.reveal_contact(uuid);
create or replace function public.reveal_contact(p_trip_id uuid)
returns table(
  trip_id uuid, requester_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer, patient_condition text,
  scheduled_at timestamptz, passenger_count smallint, special_notes text,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision, destination_lng double precision
)
language sql security definer set search_path = public
as $$
  select t.id, p.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at, t.passenger_count, t.special_notes,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id
    and t.volunteer_id = public.my_profile_id('volunteer')
    and t.status in ('accepted', 'completed');
$$;
revoke all on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;

-- Source migration: 20260923000003_instant_ride_expiration.sql

-- Separate Instant Ride lifecycle from the scheduled_at compatibility field.

alter table public.trips
  add column if not exists expires_at timestamptz
    not null default (now() + interval '15 minutes');

create index if not exists idx_trips_pending_expires_at
  on public.trips (expires_at, created_at desc)
  where status = 'pending';

create or replace function public.create_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz, p_passenger_count smallint default 1,
  p_special_notes text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_requester_profile_id from public.profiles
  where auth_user_id = p_requester_id and role = 'requester' and is_active;
  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_passenger_count is null or p_passenger_count not between 1 and 4 then
    raise exception 'passenger count must be between 1 and 4';
  end if;
  if p_special_notes is not null and char_length(p_special_notes) > 500 then
    raise exception 'special notes are too long';
  end if;
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_profile_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at, passenger_count, special_notes
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes',
    p_passenger_count, nullif(trim(p_special_notes), '')
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;

create or replace function public.create_trip(
  p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('requester');
  v_trip_id uuid;
  v_completed_count integer;
begin
  if v_requester_id is null or p_client_ip is null then
    raise exception 'authentication and trusted client IP are required';
  end if;
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at
  ) values (
    v_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes'
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;

create or replace function public.get_pending_trips_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
)
returns table (
  id uuid, requester_id uuid, volunteer_id uuid, origin_area_label text, destination_area_label text,
  status public.trip_status, requester_relation public.requester_relation, scheduled_at timestamptz,
  created_at timestamptz, accepted_at timestamptz, completed_at timestamptz,
  distance_km double precision, passenger_count smallint, special_notes text
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label, t.destination_area_label,
    t.status, t.requester_relation, t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))))))::numeric, 2)::double precision,
    t.passenger_count, t.special_notes
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending' and t.expires_at > now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;

create or replace function public.accept_trip(
  p_trip_id uuid, p_volunteer_lat double precision, p_volunteer_lng double precision
)
returns table (
  trip_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer,
  patient_condition text, scheduled_at timestamptz,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision,
  destination_lng double precision, distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' or v_trip.expires_at <= now() then
    raise exception 'trip is no longer available';
  end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;
  if v_distance is null or v_distance > 7 then
    raise exception 'هذا الطلب خارج النطاق المتاح';
  end if;
  update public.trips set status = 'accepted', volunteer_id = v_volunteer_id,
    accepted_at = now(), accepted_distance_km = round(v_distance::numeric, 2)
  where id = p_trip_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'trip is no longer available'; end if;
  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

-- Source migration: 20260923000004_assistance_location_matching.sql

-- Add location-aware roadside assistance without changing trip lifecycle.

alter table public.assistance_requests
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.assistance_requests
  drop constraint if exists assistance_requests_lat_check;
alter table public.assistance_requests
  add constraint assistance_requests_lat_check check (lat between 22 and 31.7);
alter table public.assistance_requests
  drop constraint if exists assistance_requests_lng_check;
alter table public.assistance_requests
  add constraint assistance_requests_lng_check check (lng between 24.5 and 37.0);

create index if not exists idx_assistance_requests_pending_created
  on public.assistance_requests (status, created_at desc);

drop function if exists public.create_assistance_request(text, text);

create or replace function public.create_assistance_request(
  p_issue_type text,
  p_description text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('volunteer');
  v_request_id uuid;
begin
  if v_requester_id is null then raise exception 'volunteer role required'; end if;
  if p_issue_type not in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other') then
    raise exception 'invalid assistance issue';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 5 and 1000 then
    raise exception 'assistance description is required';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'assistance location must be within Egypt';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description, lat, lng)
  values (v_requester_id, p_issue_type, trim(p_description), p_lat, p_lng)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text, double precision, double precision) from public, anon;
grant execute on function public.create_assistance_request(text, text, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_requests(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
)
returns table (
  id uuid,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  return query
  select a.id, a.issue_type, a.description, a.lat, a.lng,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))))))::numeric, 2)::double precision
  from public.assistance_requests a
  where a.status = 'pending'
    and a.lat is not null and a.lng is not null
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_assistance_requests(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_assistance_requests(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests set status = 'accepted'
  where id = p_assistance_id and status = 'pending';
  if not found then raise exception 'assistance request is no longer available'; end if;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_volunteer_ids(p_assistance_id uuid)
returns table (user_id uuid)
language sql security definer set search_path = public
as $$
  select vl.user_id
  from public.assistance_requests a
  join public.volunteer_locations vl on vl.updated_at >= now() - interval '180 minutes'
  join public.profiles p on p.id = vl.user_id
  where a.id = p_assistance_id
    and a.status = 'pending'
    and p.role = 'volunteer'
    and p.is_active
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(vl.lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(vl.lng))
      + sin(radians(vl.lat)) * sin(radians(a.lat))
    ))) <= 7;
$$;
revoke all on function public.get_nearby_assistance_volunteer_ids(uuid) from public, anon, authenticated;
grant execute on function public.get_nearby_assistance_volunteer_ids(uuid) to service_role;


-- Source migration: 20260923000005_assistance_contact_exchange.sql

-- Phase 1.1: "عون الطريق" (roadside assistance) was completely broken —
-- accept_assistance_request() returned void (no contact info at all), the
-- accepting شهم had no way to reach the requester, and the requester never
-- found out someone had accepted. This migration:
--   1) records who accepted a request (helper_id / accepted_at),
--   2) makes accept_assistance_request() hand back the requester's contact
--      info directly (same shape as accept_trip()),
--   3) adds reveal_assistance_contact()/get_my_active_assistance_help() so
--      the accepting شهم can re-fetch that contact card after a reload,
--   4) adds get_my_assistance_request() so the requester can see their own
--      request's status and the helper's contact info once accepted,
--   5) adds complete_assistance_request() so either side can close out an
--      accepted request instead of it staying open forever.

alter table public.assistance_requests
  add column if not exists helper_id uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz;

create index if not exists idx_assistance_requests_requester_status
  on public.assistance_requests (requester_id, status, created_at desc);
create index if not exists idx_assistance_requests_helper_status
  on public.assistance_requests (helper_id, status, created_at desc);

-- Dedup table so notify-assistance-accepted sends at most one push per
-- request, exactly like trip_accept_notifications does for trips. RLS is
-- enabled with zero grants to anon/authenticated on purpose: only
-- service_role (which bypasses RLS) touches this table.
create table if not exists public.assistance_accept_notifications (
  assistance_id uuid primary key references public.assistance_requests(id) on delete cascade,
  notified_at timestamptz not null default now()
);
alter table public.assistance_accept_notifications enable row level security;
revoke all on public.assistance_accept_notifications from public, anon, authenticated;
grant all on public.assistance_accept_notifications to service_role;

-- accept_assistance_request now records who accepted and hands the
-- accepting شهم the requester's contact info directly, instead of
-- returning void and leaving the frontend with nothing to show.
-- 20260923000004 defined this function as `returns void`; Postgres cannot change
-- a return type with `create or replace`, so drop it first (the grants are
-- re-applied right after the new definition below).
drop function if exists public.accept_assistance_request(uuid, double precision, double precision);

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' then raise exception 'assistance request is no longer available'; end if;
  if v_request.requester_id = v_volunteer_id then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests
    set status = 'accepted', helper_id = v_volunteer_id, accepted_at = now()
  where id = p_assistance_id and status = 'pending';
  if not found then raise exception 'assistance request is no longer available'; end if;
  return query
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng,
    round(v_distance::numeric, 2)::double precision
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.id = p_assistance_id;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

-- Lets the accepting شهم re-fetch the requester's contact card after a
-- reload/reconnect, the same way reveal_contact() does for trips.
create or replace function public.get_my_active_assistance_help()
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision
)
language sql security definer set search_path = public
as $$
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.helper_id = public.my_profile_id('volunteer')
    and a.status = 'accepted'
  order by a.accepted_at desc
  limit 1;
$$;
revoke all on function public.get_my_active_assistance_help() from public, anon;
grant execute on function public.get_my_active_assistance_help() to authenticated;

-- Lets the requester see their own open/accepted request — status, and the
-- helper's contact info once someone accepts — instead of the request just
-- disappearing from their screen with no follow-up.
create or replace function public.get_my_assistance_request()
returns table (
  assistance_id uuid,
  issue_type text,
  description text,
  status text,
  created_at timestamptz,
  helper_id uuid,
  helper_first_name text,
  helper_phone text
)
language sql security definer set search_path = public
as $$
  select a.id, a.issue_type, a.description, a.status, a.created_at,
    h.id, h.first_name, h.phone_number
  from public.assistance_requests a
  left join public.profiles h on h.id = a.helper_id
  where a.requester_id = public.my_profile_id('volunteer')
    and a.status in ('pending', 'accepted')
  order by a.created_at desc
  limit 1;
$$;
revoke all on function public.get_my_assistance_request() from public, anon;
grant execute on function public.get_my_assistance_request() to authenticated;

-- Lets either side of an accepted assistance request close it out, so the
-- new contact-exchange cards this migration adds don't stay open forever.
create or replace function public.complete_assistance_request(p_assistance_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid := public.my_profile_id('volunteer');
begin
  if v_profile_id is null then raise exception 'volunteer role required'; end if;
  update public.assistance_requests set status = 'completed'
  where id = p_assistance_id and status = 'accepted'
    and v_profile_id in (requester_id, helper_id);
  if not found then raise exception 'assistance request cannot be completed'; end if;
end;
$$;
revoke all on function public.complete_assistance_request(uuid) from public, anon;
grant execute on function public.complete_assistance_request(uuid) to authenticated;


-- Source migration: 20260923000006_add_expired_trip_status.sql

-- Phase 1.2 step 1: add 'expired' as a trip status so a pending request
-- whose 15-minute window (expires_at) has passed can be closed out
-- instead of staying 'pending' forever.
--
-- Kept in its own migration on purpose: Postgres will not let a newly
-- added enum value be referenced by name in the same transaction that
-- adds it, so the functions that use 'expired' live in the next migration.

alter type public.trip_status add value if not exists 'expired';


-- Source migration: 20260923000007_expire_stale_trips.sql

-- Phase 1.2: pending trips whose 15-minute window (expires_at) passed were
-- staying 'pending' forever — the requester's screen stayed stuck on
-- "أكتر من شهم بيشوفوا طلبك", the "one open trip" guard in
-- create_trip_from_proxy()/create_trip() only checked status = 'pending'
-- (not expires_at), and nothing in the database ever closed these out.
--
-- This migration adds a sweep function and calls it from every place a
-- trip's "is it still open" question matters, so pending requests get
-- closed out as soon as anyone interacts with the system — no pg_cron
-- extension required.

-- Client also needs to read expires_at directly (not just through the
-- distance-filtered nearby-trips RPC) to show the requester their own
-- trip's expiry.
grant select (expires_at) on public.trips to authenticated;

create or replace function public.expire_stale_trips()
returns void
language sql security definer set search_path = public
as $$
  update public.trips
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_stale_trips() from public, anon;
grant execute on function public.expire_stale_trips() to authenticated;

create or replace function public.get_pending_trips_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 7
)
returns table (
  id uuid, requester_id uuid, volunteer_id uuid, origin_area_label text, destination_area_label text,
  status public.trip_status, requester_relation public.requester_relation, scheduled_at timestamptz,
  created_at timestamptz, accepted_at timestamptz, completed_at timestamptz,
  distance_km double precision, passenger_count smallint, special_notes text
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  perform public.expire_stale_trips();
  return query
  select t.id, t.requester_id, t.volunteer_id, t.origin_area_label, t.destination_area_label,
    t.status, t.requester_relation, t.scheduled_at, t.created_at, t.accepted_at, t.completed_at,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat))))))::numeric, 2)::double precision,
    t.passenger_count, t.special_notes
  from public.trips t join public.trip_locations l on l.trip_id = t.id
  where t.status = 'pending' and t.expires_at > now()
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(l.origin_lat)) * cos(radians(l.origin_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(l.origin_lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  order by distance_km asc, t.created_at desc;
end;
$$;
revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_trip(
  p_trip_id uuid, p_volunteer_lat double precision, p_volunteer_lng double precision
)
returns table (
  trip_id uuid, requester_first_name text, requester_phone text,
  requester_relation public.requester_relation, patient_age integer,
  patient_condition text, scheduled_at timestamptz,
  origin_address text, origin_lat double precision, origin_lng double precision,
  destination_address text, destination_lat double precision,
  destination_lng double precision, distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
     or p_volunteer_lat not between 22 and 31.7
     or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;
  perform public.expire_stale_trips();
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'pending' or v_trip.expires_at <= now() then
    raise exception 'trip is no longer available';
  end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;
  if v_distance is null or v_distance > 7 then
    raise exception 'هذا الطلب خارج النطاق المتاح';
  end if;
  update public.trips set status = 'accepted', volunteer_id = v_volunteer_id,
    accepted_at = now(), accepted_distance_km = round(v_distance::numeric, 2)
  where id = p_trip_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'trip is no longer available'; end if;
  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age::integer, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

create or replace function public.create_trip_from_proxy(
  p_requester_id uuid, p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz, p_passenger_count smallint default 1,
  p_special_notes text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_profile_id uuid;
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select id into v_requester_profile_id from public.profiles
  where auth_user_id = p_requester_id and role = 'requester' and is_active;
  if v_requester_profile_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if p_passenger_count is null or p_passenger_count not between 1 and 4 then
    raise exception 'passenger count must be between 1 and 4';
  end if;
  if p_special_notes is not null and char_length(p_special_notes) > 500 then
    raise exception 'special notes are too long';
  end if;
  perform public.expire_stale_trips();
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_profile_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_profile_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at, passenger_count, special_notes
  ) values (
    v_requester_profile_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes',
    p_passenger_count, nullif(trim(p_special_notes), '')
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;

create or replace function public.create_trip(
  p_origin_area_label text, p_origin_address text,
  p_origin_lat double precision, p_origin_lng double precision,
  p_destination_area_label text, p_destination_address text,
  p_destination_lat double precision, p_destination_lng double precision,
  p_requester_relation public.requester_relation, p_client_ip inet,
  p_scheduled_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('requester');
  v_trip_id uuid;
  v_completed_count integer;
begin
  if v_requester_id is null or p_client_ip is null then
    raise exception 'authentication and trusted client IP are required';
  end if;
  perform public.expire_stale_trips();
  select count(*) into v_completed_count from public.trips
  where requester_id = v_requester_id and status = 'completed';
  if v_completed_count < 3 and exists (
    select 1 from public.trips where requester_id = v_requester_id and status in ('pending', 'accepted')
  ) then raise exception 'one open trip is allowed until three trips are completed'; end if;
  insert into public.trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip, scheduled_at, expires_at
  ) values (
    v_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip, now(), now() + interval '15 minutes'
  ) returning id into v_trip_id;
  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );
  return v_trip_id;
end;
$$;


-- Source migration: 20260924000000_fix_expired_status_constraint.sql

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


-- Source migration: 20260924000001_volunteer_cancel_accepted_trip.sql

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


-- Source migration: 20260924000002_assistance_expiry_and_cancel.sql

-- "عون الطريق" requests had no lifetime and no way to be withdrawn: an
-- unanswered request stayed 'pending' forever, the requester's card had no
-- cancel button (and hid the form, so they could not send a new one), and the
-- stale request kept showing up for nearby متطوعين. This migration:
--   1) adds expires_at (+ the 'expired' status) to assistance_requests,
--   2) adds expire_stale_assistance_requests() — same sweep pattern as
--      expire_stale_trips() — and calls it from every RPC where "is this
--      request still open" matters,
--   3) allows one open request per requester,
--   4) hides the requester's own request from their nearby list,
--   5) adds cancel_assistance_request().
-- The status column is plain text with a check constraint (not an enum), so
-- the new value can be used in this same transaction.

alter table public.assistance_requests
  add column if not exists expires_at timestamptz;

-- The request lifetime lives here and nowhere else in this file: it is used
-- both to backfill existing rows and as the column default for new ones.
do $$
declare
  v_ttl constant interval := interval '60 minutes';
begin
  update public.assistance_requests
  set expires_at = created_at + v_ttl
  where expires_at is null;

  execute format(
    'alter table public.assistance_requests alter column expires_at set default now() + %L::interval',
    v_ttl
  );
end;
$$;

alter table public.assistance_requests
  alter column expires_at set not null;

alter table public.assistance_requests
  drop constraint if exists assistance_requests_status_check;
alter table public.assistance_requests
  add constraint assistance_requests_status_check
  check (status in ('pending', 'accepted', 'completed', 'cancelled', 'expired'));

create index if not exists idx_assistance_requests_status_expires
  on public.assistance_requests (status, expires_at);

create or replace function public.expire_stale_assistance_requests()
returns void
language sql security definer set search_path = public
as $$
  update public.assistance_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_stale_assistance_requests() from public, anon;
grant execute on function public.expire_stale_assistance_requests() to authenticated;

create or replace function public.create_assistance_request(
  p_issue_type text,
  p_description text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('volunteer');
  v_request_id uuid;
begin
  if v_requester_id is null then raise exception 'volunteer role required'; end if;
  if p_issue_type not in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other') then
    raise exception 'invalid assistance issue';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 5 and 1000 then
    raise exception 'assistance description is required';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'assistance location must be within Egypt';
  end if;
  -- Serialize concurrent creates for this volunteer before checking the one-open-request rule.
  perform pg_advisory_xact_lock(hashtextextended(v_requester_id::text, 0));
  perform public.expire_stale_assistance_requests();
  if exists (
    select 1 from public.assistance_requests a
    where a.requester_id = v_requester_id
      and (a.status = 'accepted' or (a.status = 'pending' and a.expires_at > now()))
  ) then
    raise exception 'one open assistance request is allowed';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description, lat, lng)
  values (v_requester_id, p_issue_type, trim(p_description), p_lat, p_lng)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text, double precision, double precision) from public, anon;
grant execute on function public.create_assistance_request(text, text, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_requests(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
)
returns table (
  id uuid,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  perform public.expire_stale_assistance_requests();
  return query
  select a.id, a.issue_type, a.description, a.lat, a.lng,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))))))::numeric, 2)::double precision
  from public.assistance_requests a
  where a.status = 'pending'
    and a.expires_at > now()
    and a.requester_id <> public.my_profile_id('volunteer')
    and a.lat is not null and a.lng is not null
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  -- Ordinal 6 = the distance column. Ordering by the name `distance_km` would
  -- resolve to the function's OUT parameter (a constant), not the distance.
  order by 6 asc, a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_assistance_requests(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_assistance_requests(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  perform public.expire_stale_assistance_requests();
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' or v_request.expires_at <= now() then
    raise exception 'assistance request is no longer available';
  end if;
  if v_request.requester_id = v_volunteer_id then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests
    set status = 'accepted', helper_id = v_volunteer_id, accepted_at = now()
  where id = p_assistance_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'assistance request is no longer available'; end if;
  return query
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng,
    round(v_distance::numeric, 2)::double precision
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.id = p_assistance_id;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

-- Same return columns as before (no drop needed). language sql has no
-- `perform`, so an expired-but-not-yet-swept request is hidden by the filter
-- instead of by the sweep.
create or replace function public.get_my_assistance_request()
returns table (
  assistance_id uuid,
  issue_type text,
  description text,
  status text,
  created_at timestamptz,
  helper_id uuid,
  helper_first_name text,
  helper_phone text
)
language sql security definer set search_path = public
as $$
  select a.id, a.issue_type, a.description, a.status, a.created_at,
    h.id, h.first_name, h.phone_number
  from public.assistance_requests a
  left join public.profiles h on h.id = a.helper_id
  where a.requester_id = public.my_profile_id('volunteer')
    and a.status in ('pending', 'accepted')
    and (a.status = 'accepted' or a.expires_at > now())
  order by a.created_at desc
  limit 1;
$$;
revoke all on function public.get_my_assistance_request() from public, anon;
grant execute on function public.get_my_assistance_request() to authenticated;

create or replace function public.cancel_assistance_request(p_assistance_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid := public.my_profile_id('volunteer');
begin
  if v_profile_id is null then raise exception 'volunteer role required'; end if;
  update public.assistance_requests set status = 'cancelled'
  where id = p_assistance_id and requester_id = v_profile_id and status = 'pending';
  if not found then raise exception 'assistance request cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_assistance_request(uuid) from public, anon;
grant execute on function public.cancel_assistance_request(uuid) to authenticated;


-- Source migration: 20260924071143_volunteer_vehicle_details.sql

-- Require every new volunteer to register verified vehicle details and accept
-- personal responsibility for them. Existing volunteers complete this once on
-- next sign-in; NOT VALID preserves existing rows until they are updated.
alter table public.profiles
  add column if not exists vehicle_type text,
  add column if not exists vehicle_color text,
  add column if not exists vehicle_plate_number text,
  add column if not exists vehicle_data_responsibility_ack boolean not null default false,
  add column if not exists vehicle_data_acknowledged_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_volunteer_vehicle_required;
alter table public.profiles
  add constraint profiles_volunteer_vehicle_required
  check (
    role <> 'volunteer'::public.user_role
    or (
      vehicle_type is not null and char_length(trim(vehicle_type)) between 2 and 80
      and vehicle_color is not null and char_length(trim(vehicle_color)) between 2 and 40
      and vehicle_plate_number is not null and char_length(trim(vehicle_plate_number)) between 3 and 24
      and vehicle_data_responsibility_ack
    )
  ) not valid;

-- Acceptance locks vehicle identity after the volunteer has confirmed it.
create or replace function public.guard_volunteer_vehicle_details()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role = 'volunteer'::public.user_role
      and old.vehicle_data_responsibility_ack
      and (
        new.vehicle_type is distinct from old.vehicle_type
        or new.vehicle_color is distinct from old.vehicle_color
        or new.vehicle_plate_number is distinct from old.vehicle_plate_number
        or new.vehicle_data_responsibility_ack is distinct from old.vehicle_data_responsibility_ack
      ) then
      raise exception 'volunteer vehicle details cannot be changed after registration';
    end if;

    if new.role = 'volunteer'::public.user_role and new.vehicle_data_responsibility_ack then
      new.vehicle_data_acknowledged_at := coalesce(old.vehicle_data_acknowledged_at, now());
    else
      new.vehicle_data_acknowledged_at := null;
    end if;
  elsif new.role = 'volunteer'::public.user_role and new.vehicle_data_responsibility_ack then
    new.vehicle_data_acknowledged_at := now();
  else
    new.vehicle_data_acknowledged_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_volunteer_vehicle_details() from public, anon, authenticated;
drop trigger if exists trg_guard_volunteer_vehicle_details on public.profiles;
create trigger trg_guard_volunteer_vehicle_details
before insert or update on public.profiles
for each row execute function public.guard_volunteer_vehicle_details();

-- Keep a snapshot of the helper's location and distance at the time they accept.
-- Exact coordinates remain private; requesters receive only the distance via RPC.
alter table public.trips
  add column if not exists volunteer_lat double precision,
  add column if not exists volunteer_lng double precision,
  add column if not exists accepted_distance_km double precision;

alter table public.trips
  drop constraint if exists trips_volunteer_coordinates_check;
alter table public.trips
  add constraint trips_volunteer_coordinates_check
  check (
    (volunteer_lat is null and volunteer_lng is null)
    or (
      volunteer_lat is not null and volunteer_lng is not null
      and volunteer_lat between 22 and 31.7
      and volunteer_lng between 24.5 and 37.0
    )
  ) not valid;

alter table public.trips
  drop constraint if exists trips_accepted_distance_check;
alter table public.trips
  add constraint trips_accepted_distance_check
  check (accepted_distance_km is null or accepted_distance_km between 0 and 20) not valid;

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
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := auth.uid();
  v_distance double precision;
begin
  if v_volunteer_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_volunteer_id
      and p.role = 'volunteer'::public.user_role
      and p.is_active
      and p.vehicle_data_responsibility_ack
      and p.vehicle_type is not null and char_length(trim(p.vehicle_type)) between 2 and 80
      and p.vehicle_color is not null and char_length(trim(p.vehicle_color)) between 2 and 40
      and p.vehicle_plate_number is not null and char_length(trim(p.vehicle_plate_number)) between 3 and 24
  ) then
    raise exception 'volunteer vehicle details required';
  end if;

  if p_volunteer_lat is null or p_volunteer_lng is null
    or p_volunteer_lat not between 22 and 31.7
    or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  perform 1 from public.trips t where t.id = p_trip_id for update;
  select * into v_trip from public.trips t where t.id = p_trip_id;
  if not found or v_trip.status <> 'pending'::public.trip_status then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.scheduled_at < now() or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update public.trips t
  set status = 'accepted'::public.trip_status,
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      volunteer_lat = p_volunteer_lat,
      volunteer_lng = p_volunteer_lng,
      accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where t.id = p_trip_id and t.status = 'pending'::public.trip_status;
  if not found then raise exception 'trip is no longer available'; end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    p.patient_age, p.patient_condition, t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;

-- Contact and vehicle information is returned only to the requester on an
-- accepted/completed trip. The helper's exact position is deliberately omitted.
drop function if exists public.reveal_volunteer_contact(uuid);
create function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (
  trip_id uuid,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km double precision,
  vehicle_type text,
  vehicle_color text,
  vehicle_plate_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, p.first_name, p.phone_number, t.accepted_at,
    t.accepted_distance_km, p.vehicle_type, p.vehicle_color, p.vehicle_plate_number
  from public.trips t
  join public.profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = auth.uid()
    and t.status in ('accepted'::public.trip_status, 'completed'::public.trip_status);
$$;

revoke all on function public.reveal_volunteer_contact(uuid) from public, anon;
grant execute on function public.reveal_volunteer_contact(uuid) to authenticated;


-- Source migration: 20260924080000_roadside_assistance_details.sql

-- Roadside assistance request details shown to nearby Shahm volunteers.
alter table public.trips
  add column if not exists problem_type text not null default 'مساعدة عامة',
  add column if not exists people_count smallint not null default 1,
  add column if not exists request_notes text not null default '';

alter table public.trips
  drop constraint if exists trips_problem_type_check;
alter table public.trips
  add constraint trips_problem_type_check
  check (problem_type in (
    'مساعدة عامة',
    'عطل ميكانيكي',
    'إطار مثقوب',
    'نفاد الوقود',
    'بطارية السيارة',
    'مشكلة كهربائية',
    'حادث أو طارئ',
    'أخرى'
  ));

alter table public.trips
  drop constraint if exists trips_people_count_check;
alter table public.trips
  add constraint trips_people_count_check
  check (people_count between 1 and 8);

alter table public.trips
  drop constraint if exists trips_request_notes_check;
alter table public.trips
  add constraint trips_request_notes_check
  check (char_length(request_notes) <= 500);

grant select (problem_type, people_count, request_notes)
  on public.trips to authenticated;

-- Nearby requests return the categorical problem and short notes along with
-- the route and distance; exact coordinates stay private.
drop function if exists public.get_pending_trips_nearby(double precision, double precision, double precision);
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
    where p.id = v_user_id
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

revoke all on function public.get_pending_trips_nearby(double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.get_pending_trips_nearby(double precision, double precision, double precision)
  to authenticated;

-- The trusted Edge Function must supply a valid problem category when creating
-- each new request. Keep existing request limits and trusted-IP checks.
drop function if exists public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet, timestamptz
);
create function public.create_trip_from_proxy(
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
  p_scheduled_at timestamptz,
  p_problem_type text,
  p_people_count smallint,
  p_request_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_requester_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_requester_id and p.role = 'requester'::public.user_role and p.is_active
  ) then
    raise exception 'requester role required';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now()
    or p_scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment must be within the next 48 hours';
  end if;
  if p_problem_type not in (
    'عطل ميكانيكي', 'إطار مثقوب', 'نفاد الوقود', 'بطارية السيارة',
    'مشكلة كهربائية', 'حادث أو طارئ', 'أخرى'
  ) then
    raise exception 'نوع المشكلة غير صالح';
  end if;
  if p_people_count not between 1 and 8
    or p_request_notes is null or char_length(p_request_notes) > 500 then
    raise exception 'بيانات عدد الأشخاص أو الملاحظات غير صالحة';
  end if;

  select count(*) into v_completed_count
  from public.trips t
  where t.requester_id = p_requester_id and t.status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from public.trips t
    where t.requester_id = p_requester_id and t.status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into public.trips (
    requester_id, origin_area_label, destination_area_label,
    requester_relation, good_faith_ack, ack_at, ack_ip, scheduled_at,
    problem_type, people_count, request_notes
  ) values (
    p_requester_id, p_origin_area_label, p_destination_area_label,
    p_requester_relation, true, now(), p_client_ip, p_scheduled_at,
    p_problem_type, p_people_count, p_request_notes
  ) returning id into v_trip_id;

  insert into public.trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet,
  timestamptz, text, smallint, text
) from public, anon, authenticated;
grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet,
  timestamptz, text, smallint, text
) to service_role;

-- Return the categorical problem to the accepted helper without requiring a
-- second round trip or exposing any additional requester profile information.
drop function if exists public.accept_trip(uuid, double precision, double precision);
create function public.accept_trip(
  p_trip_id uuid,
  p_volunteer_lat double precision,
  p_volunteer_lng double precision
)
returns table (
  trip_id uuid,
  requester_first_name text,
  requester_phone text,
  requester_relation public.requester_relation,
  scheduled_at timestamptz,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  distance_km double precision,
  problem_type text,
  people_count smallint,
  request_notes text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_volunteer_id uuid := auth.uid();
  v_distance double precision;
begin
  if v_volunteer_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_volunteer_id
      and p.role = 'volunteer'::public.user_role
      and p.is_active
      and p.vehicle_data_responsibility_ack
      and p.vehicle_type is not null and char_length(trim(p.vehicle_type)) between 2 and 80
      and p.vehicle_color is not null and char_length(trim(p.vehicle_color)) between 2 and 40
      and p.vehicle_plate_number is not null and char_length(trim(p.vehicle_plate_number)) between 3 and 24
  ) then
    raise exception 'volunteer vehicle details required';
  end if;
  if p_volunteer_lat is null or p_volunteer_lng is null
    or p_volunteer_lat not between 22 and 31.7 or p_volunteer_lng not between 24.5 and 37.0 then
    raise exception 'volunteer location must be within Egypt';
  end if;

  perform 1 from public.trips t where t.id = p_trip_id for update;
  select * into v_trip from public.trips t where t.id = p_trip_id;
  if not found or v_trip.status <> 'pending'::public.trip_status then
    raise exception 'trip is no longer available';
  end if;
  if v_trip.scheduled_at < now() or v_trip.scheduled_at > now() + interval '48 hours' then
    raise exception 'appointment is outside the allowed time window';
  end if;

  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_volunteer_lat)) * cos(radians(l.origin_lat))
    * cos(radians(l.origin_lng) - radians(p_volunteer_lng))
    + sin(radians(p_volunteer_lat)) * sin(radians(l.origin_lat))
  ))) into v_distance
  from public.trip_locations l where l.trip_id = p_trip_id;

  if v_distance is null or v_distance > 20 then
    raise exception 'هذا الطلب خارج نطاق 20 كم من موقعك الحالي';
  end if;

  update public.trips t
  set status = 'accepted'::public.trip_status,
      volunteer_id = v_volunteer_id,
      accepted_at = now(),
      volunteer_lat = p_volunteer_lat,
      volunteer_lng = p_volunteer_lng,
      accepted_distance_km = round(v_distance::numeric, 2)::double precision
  where t.id = p_trip_id and t.status = 'pending'::public.trip_status;
  if not found then raise exception 'trip is no longer available'; end if;

  return query
  select t.id, p.first_name, p.phone_number, t.requester_relation,
    t.scheduled_at,
    l.origin_address, l.origin_lat, l.origin_lng,
    l.destination_address, l.destination_lat, l.destination_lng,
    round(v_distance::numeric, 2)::double precision,
    t.problem_type, t.people_count, t.request_notes
  from public.trips t
  join public.profiles p on p.id = t.requester_id
  join public.trip_locations l on l.trip_id = t.id
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.accept_trip(uuid, double precision, double precision) to authenticated;
-- The current app models roadside assistance as trip requests. Retire its unused legacy parallel model.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE '%assistance%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;
DROP TABLE IF EXISTS public.assistance_accept_notifications CASCADE;
DROP TABLE IF EXISTS public.assistance_requests CASCADE;
-- Ensure only the single current RPC signature remains.
DROP FUNCTION IF EXISTS public.create_trip_from_proxy(uuid, text, text, double precision, double precision, text, text, double precision, double precision, public.requester_relation, inet, timestamptz, smallint, text);

