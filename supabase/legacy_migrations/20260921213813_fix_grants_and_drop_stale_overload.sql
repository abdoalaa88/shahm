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
