-- One browser may be used by multiple Shahm accounts. Scope push endpoints
-- by profile so an upsert never tries to take over another user's row and
-- trigger the existing ownership-only RLS policy.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_pkey;

alter table public.push_subscriptions
  add constraint push_subscriptions_pkey primary key (user_id, endpoint);
