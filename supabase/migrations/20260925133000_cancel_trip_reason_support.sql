alter table public.trips
  add column if not exists cancellation_reason text;

drop function if exists public.cancel_medical_trip(uuid);
drop function if exists public.cancel_medical_trip(uuid, uuid, text);

create function public.cancel_medical_trip(
  p_trip_id uuid,
  p_requester_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'cancellation reason required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.id = p_requester_profile_id
    and p.auth_user_id = auth.uid()
    and p.role = 'requester'::public.user_role
    and p.is_active;

  if v_profile_id is null then
    raise exception 'requester role required';
  end if;

  update public.trips
  set status = 'cancelled'::public.trip_status,
      cancellation_reason = left(trim(p_reason), 500)
  where id = p_trip_id
    and requester_id = v_profile_id
    and patient_profile_id is not null
    and status in ('pending'::public.trip_status, 'accepted'::public.trip_status);

  if not found then
    raise exception 'trip cannot be cancelled';
  end if;
end;
$$;

revoke all on function public.cancel_medical_trip(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_medical_trip(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
