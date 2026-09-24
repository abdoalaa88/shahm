# Changelog

## Unreleased — Phase 4 (remaining plan items)

- Roadside assistance requests now expire (60 minutes, `expires_at` + `expired` status,
  `expire_stale_assistance_requests()`), can be cancelled by the requester
  (`cancel_assistance_request()`), and only one open request per requester is allowed
  (`20260924000002_assistance_expiry_and_cancel.sql`). The requester's "طلبك متبعت" card
  has a cancel button and shows a notice when the request expired unanswered.
- The nearby-assistance list no longer shows the شهم their own request.
- Volunteer assistance screens poll every 15 s (paused while the tab is hidden, refreshed
  on return) because `assistance_requests` is not in the realtime publication by design.
- Arabic error messages: `ReportModal`, admin `UsersPanel`/`SafetyPanel` and the remaining
  "تعذر تحميل…" messages now go through `translateApiError`; added translations for the
  active report, admin-role and profile-guard RPC messages.
- Admin pending-trips query ignores trips already past `expires_at`.
- Fix: `20260923000005` now drops the `void` version of `accept_assistance_request()` before
  redefining it (it failed with "cannot change return type" on a fresh database), and
  `get_nearby_assistance_requests()` now really sorts nearest-first (it was ordering by the
  OUT parameter `distance_km`, i.e. by creation time).

## Unreleased — Cleanup

- Removed dead code: `InstallModal.tsx` (never rendered, had a stray `console.log`) and
  `styles/tokens.ts` (never imported), plus an empty stray `.devcontainer/devcontainer` file.
- Replaced the remaining `any` types (`App.tsx` catch clause, `UsersPanel` details state).
- `index.html`: removed a duplicated Google Fonts link. Tailwind's `font-sans` now matches the
  fonts actually loaded (IBM Plex Sans Arabic, Noto Sans Arabic) instead of the unloaded Tajawal.
- `vite.config.ts`: dropped PWA `includeAssets` entries that do not exist and the `react`
  manual chunk (it produced an empty 0.06 kB file).
- Docs: README structure and ARCHITECTURE assistance lifecycle updated.

## Unreleased — Phase 3 (fixes after plan review)

- Fix: `trip_acceptance_consistency` now allows `expired`, so `expire_stale_trips()`
  no longer fails and `get_pending_trips_nearby()` keeps working once a trip goes stale
  (`20260924000000_fix_expired_status_constraint.sql`).
- "حسابي": requesters and volunteers can edit name and phone; requesters can also edit
  patient age and condition (direct `profiles` update, no new RPC).
- شهم can cancel an accepted trip via `volunteer_cancel_trip()`; the trip reopens as
  `pending` with a fresh 15-minute window (`20260924000001_volunteer_cancel_accepted_trip.sql`).

## Unreleased — Phase 2 (consistency and reliability)

- Unified Arabic error messages: `translateTripError` became `translateApiError`,
  now covers every active RPC message, dead entries removed, applied to all
  trip and assistance handlers.
- Push registration now binds the subscription to the acting role's profile.
- Google sign-in `redirectTo` uses `window.location.origin`.
- Repository cleanup: PWA icon renamed to `pwa-512x512.png`, design references
  moved to `design/stitch/`, placeholder `.env.example`, rewritten README,
  architecture doc, `.editorconfig` and `.gitattributes`.

## Phase 1 — Functional fixes

- Roadside-assistance contact exchange, notification and completion flow.
- Instant-ride expiry (`expired` status, `expire_stale_trips()`).
