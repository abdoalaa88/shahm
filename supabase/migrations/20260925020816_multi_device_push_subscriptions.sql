-- The client stores one push subscription per browser endpoint, allowing a
-- single profile to enable notifications on multiple devices.
alter table public.push_subscriptions
  add column if not exists endpoint text;

update public.push_subscriptions
set endpoint = subscription ->> 'endpoint'
where endpoint is null;

-- Old or duplicate endpoints cannot receive a valid push notification.
delete from public.push_subscriptions
where endpoint is null or btrim(endpoint) = '';

delete from public.push_subscriptions older
using public.push_subscriptions newer
where older.endpoint = newer.endpoint
  and (older.updated_at, older.user_id) < (newer.updated_at, newer.user_id);

alter table public.push_subscriptions
  alter column endpoint set not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_pkey;
alter table public.push_subscriptions
  add constraint push_subscriptions_pkey primary key (endpoint);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);
