-- 1. إضافة أعمدة إحداثيات نقطة الانطلاق لجدول الرحلات
alter table public.trips
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists volunteer_lat double precision,
  add column if not exists volunteer_lng double precision,
  add column if not exists accepted_distance_km double precision;

-- 2. إنشاء / تحديث دالة إظهار بيانات المتطوع وحساب المسافة
create or replace function public.reveal_volunteer_contact(p_trip_id uuid)
returns table (
  trip_id uuid,
  volunteer_first_name text,
  volunteer_phone text,
  accepted_at timestamptz,
  distance_km numeric
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    t.id,
    p.first_name,
    p.phone_number,
    t.accepted_at,
    case
      when t.volunteer_lat is not null 
       and t.volunteer_lng is not null 
       and t.origin_lat is not null 
       and t.origin_lng is not null 
      then
        round(
          (
            ST_DistanceSphere(
              ST_MakePoint(t.origin_lng, t.origin_lat),
              ST_MakePoint(t.volunteer_lng, t.volunteer_lat)
            ) / 1000.0
          )::numeric, 2
        )
      else null
    end as distance_km
  from trips t
  join profiles p on p.id = t.volunteer_id
  where t.id = p_trip_id
    and t.requester_id = auth.uid()
    and t.status in ('accepted', 'completed');
$$;

revoke all on function public.reveal_volunteer_contact(uuid) from public, anon;
grant execute on function public.reveal_volunteer_contact(uuid) to authenticated;
