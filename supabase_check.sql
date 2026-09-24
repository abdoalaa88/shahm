-- Shahm — post-migration sanity checks (READ-ONLY).
-- Run in the Supabase SQL editor after applying all migrations.
-- Every query should return the expected result written in its comment.

-- 1) RLS must be enabled on every public table.  Expect: no rows.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity;

-- 2) Required functions exist.  Expect: 15 rows (one per function).
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin', 'prevent_profile_privilege_escalation',
    'create_trip', 'create_trip_from_proxy', 'accept_trip', 'reveal_contact',
    'reveal_volunteer_contact', 'cancel_trip', 'complete_trip',
    'get_pending_trips_nearby', 'submit_report', 'suspend_account',
    'get_analytics_kpis', 'get_geographic_distribution',
    'get_peak_hours_distribution'
  )
order by 1, 2;

-- 3) Old function overloads must be gone.  Expect: no rows.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (p.proname = 'accept_trip' and pg_get_function_identity_arguments(p.oid) = 'p_trip_id uuid')
    or (p.proname = 'create_trip_from_proxy' and pg_get_function_arguments(p.oid) not like '%p_scheduled_at%')
  );

-- 4) Trip columns added by migrations 3-5.  Expect: 2 rows.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'trips'
  and column_name in ('scheduled_at', 'accepted_distance_km');

-- 5) Patient columns on profiles.  Expect: 2 rows.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('patient_age', 'patient_condition');

-- 6) Sensitive functions must NOT be executable by anon.  Expect: no rows.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'PUBLIC')
  and routine_name in (
    'create_trip', 'create_trip_from_proxy', 'accept_trip', 'reveal_contact',
    'reveal_volunteer_contact', 'cancel_trip', 'complete_trip',
    'get_pending_trips_nearby', 'suspend_account', 'get_analytics_kpis'
  );

-- 7) create_trip / create_trip_from_proxy must be service_role only.
--    Expect: only service_role (and postgres) listed.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('create_trip', 'create_trip_from_proxy')
order by 1, 2;

-- 8) Profile guard trigger exists and is enabled.  Expect: 1 row, tgenabled = 'O'.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'trg_prevent_profile_privilege_escalation';

-- 9) Verification bucket is private.  Expect: public = false.
select id, public from storage.buckets where id = 'verification-documents';

-- 10) trips is published to Realtime.  Expect: 1 row.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'trips';
