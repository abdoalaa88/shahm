-- Give the admin console read access through tightly scoped RPCs instead of
-- granting table-wide SELECT on trips or audit_logs to authenticated users.

create or replace function public.get_admin_dashboard_counts()
returns table (active_admins bigint, pending_trips bigint, active_trips bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_operations_admin() then
    raise exception 'operations administrator role required';
  end if;

  return query
  select
    (select count(*) from public.profiles p
     where p.role in (
       'ops_admin'::public.user_role,
       'verification_admin'::public.user_role,
       'analytics_viewer'::public.user_role,
       'super_admin'::public.user_role
     ) and p.is_active),
    (select count(*) from public.trips t where t.status = 'pending'::public.trip_status),
    (select count(*) from public.trips t where t.status = 'accepted'::public.trip_status);
end;
$$;

create or replace function public.get_admin_audit_logs(p_limit integer default 100)
returns table (
  id uuid,
  actor_id uuid,
  action text,
  target_profile_id uuid,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_operations_admin() then
    raise exception 'operations administrator role required';
  end if;

  return query
  select a.id, a.actor_id, a.action, a.target_profile_id, a.reason, a.created_at
  from public.audit_logs a
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

create or replace function public.get_admin_trips(p_limit integer default 100)
returns table (
  id uuid,
  requester_id uuid,
  volunteer_id uuid,
  origin_area_label text,
  destination_area_label text,
  status public.trip_status,
  requester_relation public.requester_relation,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_operations_admin() then
    raise exception 'operations administrator role required';
  end if;

  return query
  select
    t.id, t.requester_id, t.volunteer_id,
    t.origin_area_label, t.destination_area_label, t.status,
    t.requester_relation, t.created_at, t.accepted_at, t.completed_at
  from public.trips t
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
end;
$$;

-- Public/anonymous execution is revoked; authenticated callers still pass the
-- explicit operations-admin check inside each RPC before any data is returned.
revoke all on function public.get_admin_dashboard_counts() from public, anon;
revoke all on function public.get_admin_audit_logs(integer) from public, anon;
revoke all on function public.get_admin_trips(integer) from public, anon;
grant execute on function public.get_admin_dashboard_counts() to authenticated;
grant execute on function public.get_admin_audit_logs(integer) to authenticated;
grant execute on function public.get_admin_trips(integer) to authenticated;
