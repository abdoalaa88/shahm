-- Publish only aggregate online counts. Profile rows remain protected by RLS.
create or replace function public.get_presence_counts()
returns table (shahm_count bigint, patient_count bigint)
language sql
security definer
set search_path = ''
as $$
  select
    count(*) filter (where p.role = 'volunteer'::public.user_role),
    count(*) filter (where p.role = 'requester'::public.user_role)
  from public.profiles as p
  where p.is_active
    and p.is_online
    and p.last_seen_at >= pg_catalog.now() - interval '2 minutes';
$$;

-- The homepage displays only aggregate counts, never profile data.
revoke all on function public.get_presence_counts() from public;
grant execute on function public.get_presence_counts() to anon, authenticated;

drop policy if exists authenticated_read_shahm_presence_counts on realtime.messages;
create policy authenticated_read_shahm_presence_counts
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'shahm:presence-counts'
  );

create or replace function public.broadcast_presence_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shahm_count bigint;
  v_patient_count bigint;
begin
  select
    count(*) filter (where p.role = 'volunteer'::public.user_role),
    count(*) filter (where p.role = 'requester'::public.user_role)
  into v_shahm_count, v_patient_count
  from public.profiles as p
  where p.is_active
    and p.is_online
    and p.last_seen_at >= pg_catalog.now() - interval '2 minutes';

  -- Counts are displayed on the public home screen, but Realtime delivery is
  -- restricted to authenticated clients. No profile data or identifiers leave
  -- this trigger.
  begin
    perform realtime.send(
      pg_catalog.jsonb_build_object(
        'shahm_count', coalesce(v_shahm_count, 0),
        'patient_count', coalesce(v_patient_count, 0)
      ),
      'presence_counts_updated',
      'shahm:presence-counts',
      true
    );
  exception when others then
    -- A missing Realtime partition must never block a presence update.
    raise warning 'Could not broadcast Shahm presence counts: %', sqlerrm;
  end;

  if tg_level = 'ROW' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.broadcast_presence_counts() from public, anon, authenticated;

drop trigger if exists profiles_broadcast_presence_counts_on_write on public.profiles;
create trigger profiles_broadcast_presence_counts_on_write
  after insert or delete on public.profiles
  for each statement execute function public.broadcast_presence_counts();

drop trigger if exists profiles_broadcast_presence_counts_on_presence_update on public.profiles;
create trigger profiles_broadcast_presence_counts_on_presence_update
  after update of is_online, last_seen_at on public.profiles
  for each row execute function public.broadcast_presence_counts();

