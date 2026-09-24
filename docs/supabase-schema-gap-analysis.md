# Supabase Schema Gap Analysis

Audit date: 2026-09-17

This report records objects required by the Shahm PRD or referenced by the frontend. It does not claim that any object exists in Supabase. No local database was available because Docker/Podman is not installed, and no remote project is linked.

## Verified repository facts

- `supabase/config.toml` and a local migration now exist in the repository.
- `supabase/functions/create-trip-proxy/index.ts` now exists and validates the authenticated user, payload, origin, and trusted Cloudflare IP.
- `database.types.ts` now mirrors the local migration contract; it was not generated from a live database.
- `npx supabase gen types typescript --linked` failed with `Cannot find project ref. Have you run supabase link?`.
- `npx supabase status` could not inspect local services because Docker/Podman is unavailable.

The migrations have not been applied or validated against a running PostgreSQL instance. The CLI-generated type command remains blocked until a local database or linked project is available.

## Required migrations or adjustments

These are required implementation areas, not verified database objects:

1. Create the approved enum types: `user_role`, `trip_status`, `requester_relation`, and `verification_status`, with the exact values defined in the PRD.
2. Create `profiles` with the PRD columns, ownership foreign key to `auth.users`, safe defaults, and a trigger preventing client changes to `role` and `verification_status`.
3. Create `trips` with requester/volunteer ownership, public area labels, status, requester relation, good-faith acknowledgement fields, timestamps, constraints, and indexes for pending and ownership lookups.
4. Create `trip_locations` separately from public trip data. Exact addresses and coordinates must be protected by RLS and only exposed after authorized acceptance.
5. Create `verification_documents` with private-storage references, review state, reviewer fields, timestamps, purge metadata, and policies preventing volunteer access or self-verification.
6. Add RLS policies and explicit table/column grants for every public table. Sensitive columns must not be exposed by ordinary volunteer list queries.
7. Implement and grant only the approved RPCs: `create_trip`, `accept_trip`, `reveal_contact`, `cancel_trip`, and `complete_trip`. Verify `SECURITY DEFINER`, fixed `search_path`, authorization checks, locking, return shapes, and `REVOKE ALL FROM PUBLIC`.
8. The proxy implementation uses the service-only `create_trip_from_proxy` bridge because `create_trip` depends on `auth.uid()` while a service-role JWT has no end-user identity. This preserves direct RPC protection and must be reviewed before applying remotely.
9. Add any frontend-only operational objects currently referenced but absent from this repository: `reports`, `audit_logs`, `push_subscriptions`, `get_analytics_kpis`, `get_geographic_distribution`, `get_peak_hours_distribution`, `submit_report`, and `suspend_account`. These must be compared against the approved backend design before creation.
10. Configure Realtime for `trips` only after the table, replica identity, and RLS behavior are verified.

## Migration added

- `supabase/migrations/20260917000000_shahm_core.sql`
- Adds the core enums, tables, indexes, RLS policies, grants, protected RPCs, admin analytics RPCs, and `trips` Realtime publication entry.
- Not applied or remotely verified.
- `supabase/migrations/20260917000001_create_trip_proxy_rpc.sql`
- Adds a service-role-only bridge for the authenticated Edge Function; direct `anon` and `authenticated` execution is revoked.

## Safe local workflow after Docker/Podman is available

```powershell
cd C:\Users\hp\Downloads\shahm
npx supabase init
npx supabase start
npx supabase status
npx supabase db lint
npx supabase test db
npx supabase gen types typescript --local > database.types.ts
npm run typecheck
npm run build
```

Do not run `npx supabase db reset --linked` or `npx supabase db push` until the migrations have been reviewed against the real linked project and an approved backup/rollback procedure exists.