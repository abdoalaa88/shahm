-- Phase 1.2 step 1: add 'expired' as a trip status so a pending request
-- whose 15-minute window (expires_at) has passed can be closed out
-- instead of staying 'pending' forever.
--
-- Kept in its own migration on purpose: Postgres will not let a newly
-- added enum value be referenced by name in the same transaction that
-- adds it, so the functions that use 'expired' live in the next migration.

alter type public.trip_status add value if not exists 'expired';
