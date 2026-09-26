-- Enforce one database profile (and therefore one role) per Supabase Auth user.
-- Stop safely before changing schema if legacy multi-profile identities remain.
do $$
declare
  duplicate_accounts text;
begin
  select string_agg(
    format('%s (%s profiles)', auth_user_id, profile_count),
    ', ' order by auth_user_id
  )
  into duplicate_accounts
  from (
    select auth_user_id, count(*) as profile_count
    from public.profiles
    group by auth_user_id
    having count(*) > 1
  ) as duplicates;

  if duplicate_accounts is not null then
    raise exception
      'Cannot enforce one profile per Auth user. Resolve these duplicate auth_user_id values first: %',
      duplicate_accounts
      using errcode = '23505';
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_auth_user_id_unique unique (auth_user_id);

-- The former composite unique constraint is redundant under auth_user_id UNIQUE.
alter table public.profiles
  drop constraint if exists profiles_auth_user_id_role_unique;
