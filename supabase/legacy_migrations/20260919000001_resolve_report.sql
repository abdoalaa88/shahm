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
