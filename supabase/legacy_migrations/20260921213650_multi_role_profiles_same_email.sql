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
