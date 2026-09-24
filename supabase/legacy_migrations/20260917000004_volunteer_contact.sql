-- 1. إضافة أعمدة إحداثيات نقطة الانطلاق لجدول الرحلات
alter table public.trips
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists volunteer_lat double precision,
  add column if not exists volunteer_lng double precision,
  add column if not exists accepted_distance_km double precision;

-- 2. إنشاء / تحديث دالة إظهار بيانات المتطوع وحساب المسافة
-- The immediately following migration defines the corrected Haversine implementation.

