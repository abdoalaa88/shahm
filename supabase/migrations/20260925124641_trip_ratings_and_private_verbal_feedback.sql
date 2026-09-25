create table if not exists public.trip_ratings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rater_profile_id uuid not null references public.profiles(id),
  rated_profile_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  verbal_feedback text not null default 'متعاون'
    check (verbal_feedback in ('محترم', 'متعاون', 'ملتزم', 'سريع', 'مطمئن', 'واضح', 'مُقدِّر')),
  created_at timestamptz not null default now(),
  constraint trip_ratings_one_per_participant unique (trip_id, rater_profile_id),
  constraint trip_ratings_not_self check (rater_profile_id <> rated_profile_id)
);

alter table public.trip_ratings
  add column if not exists verbal_feedback text not null default 'متعاون';
alter table public.trip_ratings enable row level security;
revoke all on public.trip_ratings from anon, authenticated;
grant select on public.trip_ratings to authenticated;
drop policy if exists trip_ratings_select_admin on public.trip_ratings;
create policy trip_ratings_select_admin on public.trip_ratings
  for select to authenticated using (public.is_admin());
create index if not exists trip_ratings_rated_profile_idx
  on public.trip_ratings (rated_profile_id, created_at desc);

create or replace function public.get_rating_summary(p_profile_id uuid)
returns table (average_rating numeric, rating_count bigint, positive_percentage numeric)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.is_active) then
    raise exception 'active profile required';
  end if;
  return query
  select coalesce(round(avg(r.stars)::numeric, 1), 5.0)::numeric,
    count(r.id),
    case when count(r.id) = 0 then null::numeric
      else round(100.0 * count(r.id) filter (where r.stars >= 4) / count(r.id), 0)::numeric end
  from public.trip_ratings r where r.rated_profile_id = p_profile_id;
end;
$$;
revoke all on function public.get_rating_summary(uuid) from public, anon;
grant execute on function public.get_rating_summary(uuid) to authenticated;

drop function if exists public.rate_medical_trip(uuid, uuid, smallint);
drop function if exists public.rate_medical_trip(uuid, uuid, smallint, text);
create function public.rate_medical_trip(
  p_trip_id uuid,
  p_rater_profile_id uuid,
  p_stars smallint,
  p_verbal_feedback text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rater uuid;
  v_role public.user_role;
  v_rated uuid;
begin
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'rating must be 1 to 5 stars';
  end if;

  select p.id, p.role into v_rater, v_role
  from public.profiles p
  where p.id = p_rater_profile_id and p.auth_user_id = auth.uid() and p.is_active
    and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role);
  if v_rater is null then raise exception 'active trip account required'; end if;

  if (v_role = 'requester'::public.user_role and p_verbal_feedback not in ('محترم', 'متعاون', 'ملتزم', 'سريع', 'مطمئن'))
    or (v_role = 'volunteer'::public.user_role and p_verbal_feedback not in ('متعاون', 'ملتزم', 'محترم', 'واضح', 'مُقدِّر')) then
    raise exception 'invalid internal rating word for account role';
  end if;

  select case when t.requester_id = v_rater then t.volunteer_id else t.requester_id end
  into v_rated
  from public.trips t
  where t.id = p_trip_id and t.patient_profile_id is not null
    and t.status = 'completed'::public.trip_status
    and ((v_role = 'requester'::public.user_role and t.requester_id = v_rater)
      or (v_role = 'volunteer'::public.user_role and t.volunteer_id = v_rater));
  if v_rated is null then raise exception 'completed trip rating not allowed'; end if;

  insert into public.trip_ratings (trip_id, rater_profile_id, rated_profile_id, stars, verbal_feedback)
  values (p_trip_id, v_rater, v_rated, p_stars, p_verbal_feedback);
end;
$$;
revoke all on function public.rate_medical_trip(uuid, uuid, smallint, text) from public, anon;
grant execute on function public.rate_medical_trip(uuid, uuid, smallint, text) to authenticated;

create or replace function public.get_my_trip_to_rate(p_profile_id uuid)
returns table (trip_id uuid, other_profile_id uuid, other_first_name text, completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile_id uuid;
  v_role public.user_role;
begin
  select p.id, p.role into v_profile_id, v_role
  from public.profiles p
  where p.id = p_profile_id and p.auth_user_id = auth.uid() and p.is_active
    and p.role in ('requester'::public.user_role, 'volunteer'::public.user_role)
  limit 1;
  if v_profile_id is null then raise exception 'active trip account required'; end if;

  return query
  select t.id, other_profile.id, other_profile.first_name, t.completed_at
  from public.trips t
  join public.profiles other_profile on other_profile.id = case
    when t.requester_id = v_profile_id then t.volunteer_id else t.requester_id end
  where t.patient_profile_id is not null and t.status = 'completed'::public.trip_status
    and ((v_role = 'requester'::public.user_role and t.requester_id = v_profile_id)
      or (v_role = 'volunteer'::public.user_role and t.volunteer_id = v_profile_id))
    and not exists (select 1 from public.trip_ratings r where r.trip_id = t.id and r.rater_profile_id = v_profile_id)
  order by t.completed_at desc nulls last limit 1;
end;
$$;
revoke all on function public.get_my_trip_to_rate(uuid) from public, anon;
grant execute on function public.get_my_trip_to_rate(uuid) to authenticated;

notify pgrst, 'reload schema';
