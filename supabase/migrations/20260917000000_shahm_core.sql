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
