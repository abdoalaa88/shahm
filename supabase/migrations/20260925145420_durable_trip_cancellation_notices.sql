-- Persist cancellation notices in the same transaction as the trip status
-- change, so realtime or push delivery gaps cannot hide them from a participant.
create table if not exists public.trip_in_app_notifications (
  event_id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_kind text not null check (
    notification_kind in ('requester_cancelled', 'volunteer_cancelled')
  ),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists trip_in_app_notifications_recipient_unread_idx
  on public.trip_in_app_notifications (recipient_profile_id, created_at desc)
  where read_at is null;

alter table public.trip_in_app_notifications enable row level security;
revoke all on public.trip_in_app_notifications from public, anon, authenticated;
grant select on public.trip_in_app_notifications to authenticated;
grant update (read_at) on public.trip_in_app_notifications to authenticated;

drop policy if exists trip_in_app_notifications_recipient_read
  on public.trip_in_app_notifications;
create policy trip_in_app_notifications_recipient_read
  on public.trip_in_app_notifications
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = recipient_profile_id
        and p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists trip_in_app_notifications_recipient_mark_read
  on public.trip_in_app_notifications;
create policy trip_in_app_notifications_recipient_mark_read
  on public.trip_in_app_notifications
  for update to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = recipient_profile_id
        and p.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = recipient_profile_id
        and p.auth_user_id = (select auth.uid())
    )
  );

create or replace function public.record_trip_cancellation_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_profile_id uuid;
  v_notification_kind text;
begin
  -- Only accepted trips have another participant who needs a cancellation notice.
  if old.status <> 'accepted'::public.trip_status
     or new.cancellation_event_id is null
     or new.last_cancellation_actor_profile_id is null then
    return new;
  end if;

  if new.status = 'cancelled'::public.trip_status
     and new.last_cancellation_actor_role = 'requester'::public.user_role
     and new.volunteer_id is not null then
    v_recipient_profile_id := new.volunteer_id;
    v_notification_kind := 'requester_cancelled';
  elsif new.status = 'pending'::public.trip_status
     and new.last_cancellation_actor_role = 'volunteer'::public.user_role
     and old.volunteer_id is not null then
    v_recipient_profile_id := new.requester_id;
    v_notification_kind := 'volunteer_cancelled';
  else
    return new;
  end if;

  -- Trigger runs as the table owner; clients have no INSERT grant/policy.
  insert into public.trip_in_app_notifications (
    event_id,
    trip_id,
    actor_profile_id,
    recipient_profile_id,
    notification_kind,
    cancellation_reason
  ) values (
    new.cancellation_event_id,
    new.id,
    new.last_cancellation_actor_profile_id,
    v_recipient_profile_id,
    v_notification_kind,
    left(nullif(trim(new.cancellation_reason), ''), 500)
  )
  on conflict (event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.record_trip_cancellation_notice() from public, anon, authenticated;

drop trigger if exists trips_record_cancellation_notice on public.trips;
create trigger trips_record_cancellation_notice
  after update of status on public.trips
  for each row
  when (old.status is distinct from new.status)
  execute function public.record_trip_cancellation_notice();

-- Postgres Changes only streams tables in the Realtime publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_in_app_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_in_app_notifications';
  end if;
end;
$$;

