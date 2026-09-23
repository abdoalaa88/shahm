-- 1. إضافة أعمدة إحداثيات نقطة الانطلاق لجدول الرحلات
alter table public.trips 
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision;
-- 2. (Phase 4) reveal_volunteer_contact كانت هنا، لكنها كانت بتفشل عند التنفيذ
--    على أي قاعدة جديدة: بتعتمد على PostGIS (ST_DistanceSphere/ST_MakePoint) وعلى
--    trips.volunteer_lat/volunteer_lng، ومفيش أي منهم موجود في الـ schema
--    (ERROR: column t.volunteer_lat does not exist) — فكانت بتكسر
--    `supabase db reset` وأي مشروع جديد. النسخة الصحيحة (haversine على
--    accepted_distance_km) معرّفة في 20260917000005_accept_trip_distance_and_profile_guard.sql،
--    فاتشالت الدالة المعطوبة من هنا بدل ما تتكرر.;
