# Architecture

## Roles and profiles

One `auth.users` account can own several rows in `profiles`, one per role
(`volunteer`, `requester`, plus the admin roles `ops_admin`,
`verification_admin`, `analytics_viewer`). The role the user is currently acting
as is kept client-side under `ACTIVE_ROLE_KEY` (`shahm.activeRole`).

Server-side, the acting profile is always resolved with
`public.my_profile_id('volunteer' | 'requester')`, which returns `null` when no
active profile with that role belongs to `auth.uid()`. Do not compare
`auth.uid()` to a profile id directly.

## Data-access conventions

- Client-callable RPCs are `security definer set search_path = public`, followed
  by `revoke all ... from public, anon;` and `grant execute ... to authenticated;`
  (`service_role` only for internal functions).
- Sensitive tables (`assistance_requests`, `trip_accept_notifications`,
  `assistance_accept_notifications`, `volunteer_locations`) have RLS enabled,
  all client grants revoked, and `service_role` only. Clients reach them through
  RPCs, never through direct `SELECT`.
- Exact locations and contact details are revealed only after a request is
  accepted (`reveal_contact`, `accept_assistance_request`).
- The volunteer matching radius is 7 km (`get_pending_trips_nearby`,
  `get_nearby_assistance_requests`).

## Request lifecycle

- **Instant ride:** `create_trip` (through the `create-trip-proxy` edge function,
  which captures the trusted Cloudflare client IP) → `pending` → `accept_trip` →
  `accepted` → `complete_trip`, or `cancel_trip`, or `expired`.
- **Expiry:** `expire_stale_trips()` moves pending trips past `expires_at` to
  `expired`. It runs inside the RPCs that touch trips, and the client also polls
  as a backstop, so no `pg_cron` is needed.
- **Roadside assistance:** `create_assistance_request` (one open request per requester,
  expires after 60 minutes) → `accept_assistance_request` (returns the requester's
  contact details) → `complete_assistance_request`, or `cancel_assistance_request`,
  or `expired` (`expire_stale_assistance_requests()`, same sweep pattern as trips).
  The table is not in the realtime publication, so the volunteer screens poll every 15 s.

## Notifications

`send-push` delivers Web Push (VAPID). `notify-trip-accepted`,
`notify-assistance-request` and `notify-assistance-accepted` decide who to notify
and de-duplicate through their notification tables. The client registers a
subscription for the acting role via `registerPushNotifications(role)`.

## Frontend error handling

RPCs raise English messages. `translateApiError` in `src/lib/apiErrors.ts` maps them to
Egyptian-Arabic text; unknown messages pass through unchanged. When you add a
`raise exception` in a migration, add its translation there and route the call
site's `error.message` through `translateApiError`.

## Migrations

Files in `supabase/migrations/` are timestamped and applied in order. Never edit
an applied migration. New enum values need their own migration, because Postgres
cannot use a new enum value in the transaction that added it.
