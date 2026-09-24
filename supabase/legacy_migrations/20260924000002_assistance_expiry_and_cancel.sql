-- "عون الطريق" requests had no lifetime and no way to be withdrawn: an
-- unanswered request stayed 'pending' forever, the requester's card had no
-- cancel button (and hid the form, so they could not send a new one), and the
-- stale request kept showing up for nearby متطوعين. This migration:
--   1) adds expires_at (+ the 'expired' status) to assistance_requests,
--   2) adds expire_stale_assistance_requests() — same sweep pattern as
--      expire_stale_trips() — and calls it from every RPC where "is this
--      request still open" matters,
--   3) allows one open request per requester,
--   4) hides the requester's own request from their nearby list,
--   5) adds cancel_assistance_request().
-- The status column is plain text with a check constraint (not an enum), so
-- the new value can be used in this same transaction.

alter table public.assistance_requests
  add column if not exists expires_at timestamptz;

-- The request lifetime lives here and nowhere else in this file: it is used
-- both to backfill existing rows and as the column default for new ones.
do $$
declare
  v_ttl constant interval := interval '60 minutes';
begin
  update public.assistance_requests
  set expires_at = created_at + v_ttl
  where expires_at is null;

  execute format(
    'alter table public.assistance_requests alter column expires_at set default now() + %L::interval',
    v_ttl
  );
end;
$$;

alter table public.assistance_requests
  alter column expires_at set not null;

alter table public.assistance_requests
  drop constraint if exists assistance_requests_status_check;
alter table public.assistance_requests
  add constraint assistance_requests_status_check
  check (status in ('pending', 'accepted', 'completed', 'cancelled', 'expired'));

create index if not exists idx_assistance_requests_status_expires
  on public.assistance_requests (status, expires_at);

create or replace function public.expire_stale_assistance_requests()
returns void
language sql security definer set search_path = public
as $$
  update public.assistance_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
$$;
revoke all on function public.expire_stale_assistance_requests() from public, anon;
grant execute on function public.expire_stale_assistance_requests() to authenticated;

create or replace function public.create_assistance_request(
  p_issue_type text,
  p_description text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_requester_id uuid := public.my_profile_id('volunteer');
  v_request_id uuid;
begin
  if v_requester_id is null then raise exception 'volunteer role required'; end if;
  if p_issue_type not in ('tire', 'fuel', 'battery', 'water', 'breakdown', 'other') then
    raise exception 'invalid assistance issue';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 5 and 1000 then
    raise exception 'assistance description is required';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 22 and 31.7 or p_lng not between 24.5 and 37.0 then
    raise exception 'assistance location must be within Egypt';
  end if;
  -- Serialize concurrent creates for this volunteer before checking the one-open-request rule.
  perform pg_advisory_xact_lock(hashtextextended(v_requester_id::text, 0));
  perform public.expire_stale_assistance_requests();
  if exists (
    select 1 from public.assistance_requests a
    where a.requester_id = v_requester_id
      and (a.status = 'accepted' or (a.status = 'pending' and a.expires_at > now()))
  ) then
    raise exception 'one open assistance request is allowed';
  end if;
  insert into public.assistance_requests (requester_id, issue_type, description, lat, lng)
  values (v_requester_id, p_issue_type, trim(p_description), p_lat, p_lng)
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.create_assistance_request(text, text, double precision, double precision) from public, anon;
grant execute on function public.create_assistance_request(text, text, double precision, double precision) to authenticated;

create or replace function public.get_nearby_assistance_requests(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 7
)
returns table (
  id uuid,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_profile_id('volunteer') is null then raise exception 'volunteer role required'; end if;
  perform public.expire_stale_assistance_requests();
  return query
  select a.id, a.issue_type, a.description, a.lat, a.lng,
    round((6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat))))))::numeric, 2)::double precision
  from public.assistance_requests a
  where a.status = 'pending'
    and a.expires_at > now()
    and a.requester_id <> public.my_profile_id('volunteer')
    and a.lat is not null and a.lng is not null
    and (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(a.lat)))))) <= least(greatest(coalesce(p_radius_km, 7), 0), 7)
  -- Ordinal 6 = the distance column. Ordering by the name `distance_km` would
  -- resolve to the function's OUT parameter (a constant), not the distance.
  order by 6 asc, a.created_at desc;
end;
$$;
revoke all on function public.get_nearby_assistance_requests(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_assistance_requests(double precision, double precision, double precision) to authenticated;

create or replace function public.accept_assistance_request(
  p_assistance_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns table (
  assistance_id uuid,
  requester_id uuid,
  requester_first_name text,
  requester_phone text,
  issue_type text,
  description text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language plpgsql security definer set search_path = public
as $$
declare
  v_request public.assistance_requests%rowtype;
  v_volunteer_id uuid := public.my_profile_id('volunteer');
  v_distance double precision;
begin
  if v_volunteer_id is null then raise exception 'volunteer role required'; end if;
  perform public.expire_stale_assistance_requests();
  select * into v_request from public.assistance_requests where id = p_assistance_id for update;
  if not found or v_request.status <> 'pending' or v_request.expires_at <= now() then
    raise exception 'assistance request is no longer available';
  end if;
  if v_request.requester_id = v_volunteer_id then raise exception 'assistance request is no longer available'; end if;
  select 6371 * acos(least(1.0, greatest(-1.0,
    cos(radians(p_lat)) * cos(radians(v_request.lat)) * cos(radians(v_request.lng) - radians(p_lng))
    + sin(radians(p_lat)) * sin(radians(v_request.lat))
  ))) into v_distance;
  if v_distance is null or v_distance > 7 then raise exception 'assistance request is outside the available range'; end if;
  update public.assistance_requests
    set status = 'accepted', helper_id = v_volunteer_id, accepted_at = now()
  where id = p_assistance_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'assistance request is no longer available'; end if;
  return query
  select a.id, p.id, p.first_name, p.phone_number, a.issue_type, a.description, a.lat, a.lng,
    round(v_distance::numeric, 2)::double precision
  from public.assistance_requests a
  join public.profiles p on p.id = a.requester_id
  where a.id = p_assistance_id;
end;
$$;
revoke all on function public.accept_assistance_request(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_assistance_request(uuid, double precision, double precision) to authenticated;

-- Same return columns as before (no drop needed). language sql has no
-- `perform`, so an expired-but-not-yet-swept request is hidden by the filter
-- instead of by the sweep.
create or replace function public.get_my_assistance_request()
returns table (
  assistance_id uuid,
  issue_type text,
  description text,
  status text,
  created_at timestamptz,
  helper_id uuid,
  helper_first_name text,
  helper_phone text
)
language sql security definer set search_path = public
as $$
  select a.id, a.issue_type, a.description, a.status, a.created_at,
    h.id, h.first_name, h.phone_number
  from public.assistance_requests a
  left join public.profiles h on h.id = a.helper_id
  where a.requester_id = public.my_profile_id('volunteer')
    and a.status in ('pending', 'accepted')
    and (a.status = 'accepted' or a.expires_at > now())
  order by a.created_at desc
  limit 1;
$$;
revoke all on function public.get_my_assistance_request() from public, anon;
grant execute on function public.get_my_assistance_request() to authenticated;

create or replace function public.cancel_assistance_request(p_assistance_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid := public.my_profile_id('volunteer');
begin
  if v_profile_id is null then raise exception 'volunteer role required'; end if;
  update public.assistance_requests set status = 'cancelled'
  where id = p_assistance_id and requester_id = v_profile_id and status = 'pending';
  if not found then raise exception 'assistance request cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_assistance_request(uuid) from public, anon;
grant execute on function public.cancel_assistance_request(uuid) to authenticated;
