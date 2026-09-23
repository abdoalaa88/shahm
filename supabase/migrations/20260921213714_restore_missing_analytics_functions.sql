-- These three admin-analytics RPCs are defined in the very first migration
-- (20260917000000_shahm_core.sql) and are recorded as applied, but were
-- absent from this database before this fix (confirmed via pg_proc) --
-- pre-existing drift between migration history and actual schema, unrelated
-- to the multi-role change. Their logic only gates on is_admin() and never
-- assumed profiles.id = auth.uid(), so they're safe to add unmodified.
-- src/components/admin/AnalyticsDashboard.tsx calls all three directly.

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

revoke all on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() from public, anon;
grant execute on function public.get_analytics_kpis(), public.get_geographic_distribution(integer), public.get_peak_hours_distribution() to authenticated;

-- reveal_volunteer_contact still matched the trip's requester via raw
-- auth.uid() = profiles.id, an assumption the multi-role migration broke:
-- a person's SECOND profile (any role created after their first) gets a
-- fresh generated id that is no longer equal to auth.uid(). Bring it in
-- line with every other RPC this migration touched.
create or replace function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (trip_id uuid, volunteer_first_name text, volunteer_phone text, accepted_at timestamptz, distance_km numeric)
language sql
stable security definer
set search_path = public
as $$
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.accepted_at,
    t.accepted_distance_km
  from trips t
  join profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = public.my_profile_id('requester')
    and t.status in ('accepted', 'completed');
$$;
;
