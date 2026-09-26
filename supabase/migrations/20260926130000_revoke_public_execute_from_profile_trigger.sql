-- This function is invoked by the profiles table trigger, not by API clients.
-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default; remove that
-- unnecessary API privilege while leaving the trigger itself intact.
revoke all on function public.prevent_profile_privilege_escalation()
from public, anon, authenticated;
