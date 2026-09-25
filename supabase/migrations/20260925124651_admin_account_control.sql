-- Audited account activation controls for operations and super admins.
-- Admin roles themselves are changed only through the trusted admin Edge Function.
create or replace function public.is_operations_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role in ('ops_admin'::public.user_role, 'super_admin'::public.user_role)
      and p.is_active
  );
$$;

create or replace function public.is_verification_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role in ('verification_admin'::public.user_role, 'super_admin'::public.user_role)
      and p.is_active
  );
$$;

create or replace function public.is_safety_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role in ('ops_admin'::public.user_role, 'verification_admin'::public.user_role, 'super_admin'::public.user_role)
      and p.is_active
  );
$$;

revoke all on function public.is_operations_admin(), public.is_verification_admin(), public.is_safety_admin() from public, anon;
grant execute on function public.is_operations_admin(), public.is_verification_admin(), public.is_safety_admin() to authenticated;

-- Keep analytics-only accounts on aggregate RPCs; they must not read direct PII,
-- detailed trips, safety reports, verification documents, ratings, or audit notes.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_operations_admin());

drop policy if exists trips_select_admin on public.trips;
create policy trips_select_admin on public.trips for select to authenticated
  using (public.is_operations_admin());

drop policy if exists trip_locations_select_admin on public.trip_locations;
create policy trip_locations_select_admin on public.trip_locations for select to authenticated
  using (public.is_operations_admin());

drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports for select to authenticated
  using (public.is_safety_admin());

drop policy if exists verification_documents_select_admin on public.verification_documents;
create policy verification_documents_select_admin on public.verification_documents for select to authenticated
  using (public.is_operations_admin() or public.is_verification_admin());

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs for select to authenticated
  using (public.is_operations_admin());

drop policy if exists trip_ratings_select_admin on public.trip_ratings;
create policy trip_ratings_select_admin on public.trip_ratings for select to authenticated
  using (public.is_operations_admin());

create or replace function public.suspend_account(p_target_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid; v_target_auth_user_id uuid; v_target_role public.user_role;
begin
  if not public.is_operations_admin() then raise exception 'operations administrator role required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 or char_length(trim(p_reason)) > 500 then
    raise exception 'reason must contain between 5 and 500 characters';
  end if;
  select p.id into v_actor_id from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role in ('ops_admin'::public.user_role, 'super_admin'::public.user_role)
    and p.is_active
  order by case when p.role = 'super_admin'::public.user_role then 0 else 1 end limit 1;
  select p.auth_user_id, p.role into v_target_auth_user_id, v_target_role
  from public.profiles p where p.id = p_target_profile_id for update;
  if v_target_auth_user_id is null then raise exception 'account not found'; end if;
  if v_target_auth_user_id = auth.uid() then raise exception 'cannot suspend your own account'; end if;
  if v_target_role not in ('requester'::public.user_role, 'volunteer'::public.user_role) then
    raise exception 'administrator accounts cannot be suspended here';
  end if;
  update public.profiles set is_active = false where id = p_target_profile_id;
  insert into public.audit_logs (actor_id, action, target_profile_id, reason)
  values (v_actor_id, 'suspend_account', p_target_profile_id, left(trim(p_reason), 500));
end;
$$;

create or replace function public.resolve_report(p_report_id uuid, p_status public.report_status)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare v_report public.reports%rowtype; v_actor_id uuid;
begin
  if not public.is_safety_admin() then raise exception 'safety administrator role required'; end if;
  if p_report_id is null or p_status is null or p_status not in ('reviewed'::public.report_status, 'dismissed'::public.report_status, 'actioned'::public.report_status) then
    raise exception 'a valid report and resolution status are required';
  end if;
  select p.id into v_actor_id from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role in ('ops_admin'::public.user_role, 'verification_admin'::public.user_role, 'super_admin'::public.user_role)
    and p.is_active
  order by case when p.role = 'super_admin'::public.user_role then 0 when p.role = 'ops_admin'::public.user_role then 1 else 2 end limit 1;
  update public.reports set status = p_status, reviewed_by = v_actor_id, reviewed_at = now()
  where id = p_report_id and status = 'pending'::public.report_status returning * into v_report;
  if not found then raise exception 'report not found or is not pending'; end if;
  insert into public.audit_logs (actor_id, action, target_profile_id, trip_id, metadata)
  values (v_actor_id, 'resolve_report', v_report.reported_profile_id, v_report.trip_id,
    jsonb_build_object('report_id', v_report.id, 'new_status', p_status));
  return v_report;
end;
$$;

revoke all on function public.suspend_account(uuid, text), public.resolve_report(uuid, public.report_status) from public, anon;
grant execute on function public.suspend_account(uuid, text), public.resolve_report(uuid, public.report_status) to authenticated;

create or replace function public.set_profile_active(
  p_target_profile_id uuid,
  p_is_active boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_target_auth_user_id uuid;
  v_target_role public.user_role;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 or char_length(trim(p_reason)) > 500 then
    raise exception 'reason must contain between 5 and 500 characters';
  end if;

  select p.id into v_actor_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.role in ('ops_admin'::public.user_role, 'super_admin'::public.user_role)
    and p.is_active
  order by case when p.role = 'super_admin'::public.user_role then 0 else 1 end
  limit 1;
  if v_actor_id is null then raise exception 'operations administrator role required'; end if;

  select p.auth_user_id, p.role into v_target_auth_user_id, v_target_role
  from public.profiles p where p.id = p_target_profile_id for update;
  if v_target_auth_user_id is null then raise exception 'account not found'; end if;
  if v_target_auth_user_id = auth.uid() then raise exception 'cannot change your own account status'; end if;
  if v_target_role not in ('requester'::public.user_role, 'volunteer'::public.user_role) then
    raise exception 'administrator accounts must be managed from the supervisor console';
  end if;

  update public.profiles set is_active = p_is_active where id = p_target_profile_id;
  insert into public.audit_logs (actor_id, action, target_profile_id, reason)
  values (
    v_actor_id,
    case when p_is_active then 'enable_user' else 'disable_user' end,
    p_target_profile_id,
    left(trim(p_reason), 500)
  );
end;
$$;

revoke all on function public.set_profile_active(uuid, boolean, text) from public, anon;
grant execute on function public.set_profile_active(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
