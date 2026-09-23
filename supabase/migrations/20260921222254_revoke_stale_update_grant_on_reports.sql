-- The 2026-09-19 resolve_report migration documented "no client-facing
-- UPDATE grant on reports" as a deliberate design decision (all status
-- changes must go through the resolve_report() SECURITY DEFINER RPC),
-- but never actually revoked the UPDATE privilege that Postgres/Supabase
-- grants to `authenticated` by default when the table was first created.
-- RLS already has no UPDATE policy on reports, so this was not directly
-- exploitable, but tightening the grant to match the documented intent
-- is correct defense-in-depth.
revoke update on public.reports from authenticated;;
