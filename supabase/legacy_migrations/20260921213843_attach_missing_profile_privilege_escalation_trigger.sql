-- Critical pre-existing gap, unrelated to the multi-role migration: the
-- public.prevent_profile_privilege_escalation() function existed, but no
-- trigger on public.profiles ever called it. Every migration file since
-- shahm_core.sql assumes this trigger is active (phase6_fixes.sql's own
-- comment describes exactly the self-unsuspend attack this prevents), and
-- supabase_check.sql check 8 expects it to exist -- it was simply never
-- created in this database. Without it, profiles_update_own (auth_user_id =
-- auth.uid()) lets any authenticated user directly UPDATE their own role,
-- verification_status, or is_active via PostgREST -- i.e. self-promote to
-- super_admin or un-suspend themselves.
drop trigger if exists trg_prevent_profile_privilege_escalation on public.profiles;

create trigger trg_prevent_profile_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();
;
