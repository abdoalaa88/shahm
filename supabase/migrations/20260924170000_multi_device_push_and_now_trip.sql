-- Keep existing installations in sync with the multi-device push and instant-trip changes.
-- This is additive and safe for the linked project; the destructive baseline is not rerun.

alter table public.push_subscriptions
  add column if not exists endpoint text;

update public.push_subscriptions
set endpoint = subscription ->> 'endpoint'
where endpoint is null;

-- Malformed legacy rows cannot deliver a Web Push notification.
delete from public.push_subscriptions
where endpoint is null or btrim(endpoint) = '';

-- A browser endpoint can belong to only one signed-in account at a time.
delete from public.push_subscriptions older
using public.push_subscriptions newer
where older.endpoint = newer.endpoint
  and (older.updated_at, older.user_id) < (newer.updated_at, newer.user_id);

alter table public.push_subscriptions
  alter column endpoint set not null;

-- Rebuild the primary key in either the old single-device or new per-endpoint shape.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_pkey;
alter table public.push_subscriptions
  add constraint push_subscriptions_pkey primary key (endpoint);
create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

-- Match the two-minute grace period used by the browser and create-trip-proxy.
alter table public.trips
  drop constraint if exists trips_scheduled_at_check;
alter table public.trips
  add constraint trips_scheduled_at_check
  check (
    scheduled_at is not null
    and scheduled_at >= created_at - interval '2 minutes'
    and scheduled_at <= created_at + interval '48 hours'
  );

-- Update the installed service-only creation RPC without duplicating its long body.
do $$
declare
  v_oid oid;
  v_definition text;
  v_updated text;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_trip_from_proxy'
      and p.prosrc like '%p_scheduled_at%'
  loop
    v_definition := pg_get_functiondef(v_oid);
    v_updated := replace(
      v_definition,
      'p_scheduled_at < now()',
      'p_scheduled_at < now() - interval ''2 minutes'''
    );
    if v_updated <> v_definition then
      execute v_updated;
    end if;
  end loop;

  -- Requests scheduled for "now" must remain visible to nearby volunteers.
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc like '%scheduled_at >= now()%'
  loop
    v_definition := pg_get_functiondef(v_oid);
    v_updated := replace(
      v_definition,
      'scheduled_at >= now()',
      'scheduled_at >= now() - interval ''2 minutes'''
    );
    if v_updated <> v_definition then
      execute v_updated;
    end if;
  end loop;
end
$$;
