-- Bridge the trusted Edge Function to create_trip semantics without exposing a
-- client-callable RPC or relying on auth.uid() from a service-role JWT.

create or replace function public.create_trip_from_proxy(
  p_requester_id uuid,
  p_origin_area_label text,
  p_origin_address text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_area_label text,
  p_destination_address text,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_requester_relation public.requester_relation,
  p_client_ip inet
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_completed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_requester_id is null or p_client_ip is null then
    raise exception 'requester and trusted client IP are required';
  end if;
  if not exists (select 1 from profiles where id = p_requester_id and role = 'requester' and is_active) then
    raise exception 'requester role required';
  end if;

  select count(*) into v_completed_count
  from trips
  where requester_id = p_requester_id and status = 'completed';

  if v_completed_count < 3 and exists (
    select 1 from trips where requester_id = p_requester_id and status in ('pending', 'accepted')
  ) then
    raise exception 'one open trip is allowed until three trips are completed';
  end if;

  insert into trips (
    requester_id, origin_area_label, destination_area_label, requester_relation,
    good_faith_ack, ack_at, ack_ip
  ) values (
    p_requester_id, p_origin_area_label, p_destination_area_label, p_requester_relation,
    true, now(), p_client_ip
  ) returning id into v_trip_id;

  insert into trip_locations (
    trip_id, origin_address, origin_lat, origin_lng,
    destination_address, destination_lat, destination_lng
  ) values (
    v_trip_id, p_origin_address, p_origin_lat, p_origin_lng,
    p_destination_address, p_destination_lat, p_destination_lng
  );

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet
) from public, anon, authenticated;

grant execute on function public.create_trip_from_proxy(
  uuid, text, text, double precision, double precision, text, text,
  double precision, double precision, public.requester_relation, inet
) to service_role;
