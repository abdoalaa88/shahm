# شَهْم — مساعدة على الطريق

تتضمن هذه الحزمة واجهة التطبيق، ملفات Supabase، ووظيفة إنشاء الطلبات. التطبيق يعرض واجهة عربية RTL بتصميم أخضر وكريمي، وحزمة تثبيت PWA للهواتف.

## ما يتضمنه التطبيق

- نافذة تثبيت وسط الشاشة بخلفية معتمة ومموهة. بعد إغلاقها يظهر زر تسجيل فعلي؛ ويختفي بعد التثبيت أو تسجيل الدخول.
- أيقونة التثبيت وشاشة البداية والترويسة تستخدم شعار القطرة الأخضر الموحد؛ تم تحديث ملفات PWA بأسماء جديدة لإجبار الهاتف على جلب الشعار بعد تحديث التطبيق.
- ترويسة رئيسية بسيطة تقتصر على شعار شهم واسمه، مع ترحيب شخصي وعبارة «الناس للناس» والاقتباس الذي طلبه المستخدم.
- شريط سفلي ثابت لا يغطي المحتوى: حسابي، الإرشادات، والمشاوير.
- نموذج «طلب مساعدة عالطريق» يجمع نوع المشكلة، نقطة البداية والوجهة، موعد المساعدة، عدد الأشخاص، وملاحظات اختيارية.
- أنواع المشكلة تظهر للشهمين القريبين قبل القبول، كما تظهر في التنبيهات وبطاقة التفاصيل.
- بعد القبول تظهر للمستفيد بيانات الشهم ورقم هاتفه والاتصال وواتساب والمسافة المسجلة لحظة القبول، إضافة إلى نوع السيارة ولونها ورقم لوحتها.
- تسجيل الشهم يتطلب بيانات السيارة وإقرار المسؤولية. قاعدة البيانات تمنع تعديل بيانات السيارة بعد الإقرار، وتطلب من الحسابات القديمة إكمال البيانات عند دخولها.
- نوع الطلب والمسار وعدد الأشخاص والملاحظات تظهر في بطاقة واحدة مختصرة، من دون تكرار مسار الرحلة.
- شاشة انتظار الطلب تعرض مؤشر تحميل دائريًا مع ملخص واحد للطلب وإمكانية إلغائه.

## قبل تشغيل النسخة

1. ثبّت الاعتمادات بالأمر npm install.
2. اضبط VITE_SUPABASE_ANON_KEY كما هو موضح في ملف .env.example.
3. طبّق ملفات الترحيل بالترتيب على مشروع Supabase:
   - supabase/migrations/20260917000000_shahm_core.sql
   - supabase/migrations/20260917000001_create_trip_proxy_rpc.sql
   - supabase/migrations/20260917000003_scheduling_distance_patient.sql
   - supabase/migrations/20260917000004_volunteer_contact.sql
   - supabase/migrations/20260917000005_accept_trip_distance_and_profile_guard.sql
   - supabase/migrations/20260917000006_volunteer_locations_for_push.sql
   - supabase/migrations/20260919000001_resolve_report.sql
   - supabase/migrations/20260920000000_trip_accept_notifications.sql
   - supabase/migrations/20260920000001_reveal_contact_requester_id.sql
   - supabase/migrations/20260920000002_phase6_fixes.sql
   - supabase/migrations/20260920000003_hide_patient_details_pre_acceptance.sql
   - supabase/migrations/20260920000004_scope_pending_trips_policy_to_nearby.sql
   - supabase/migrations/20260921092340_exclude_expired_trips_from_nearby.sql
   - supabase/migrations/20260921213650_multi_role_profiles_same_email.sql
   - supabase/migrations/20260921213714_restore_missing_analytics_functions.sql
   - supabase/migrations/20260921213813_fix_grants_and_drop_stale_overload.sql
   - supabase/migrations/20260921213843_attach_missing_profile_privilege_escalation_trigger.sql
   - supabase/migrations/20260921222254_revoke_stale_update_grant_on_reports.sql
   - supabase/migrations/20260922105808_fix_patient_age_smallint_return_type_mismatch.sql
   - supabase/migrations/20260923000000_fix_runtime_profile_and_trip_contracts.sql
   - supabase/migrations/20260923000001_limit_trip_distance_to_7km.sql
   - supabase/migrations/20260923000002_beneficiary_trip_and_assistance_requests.sql
   - supabase/migrations/20260923000003_instant_ride_expiration.sql
   - supabase/migrations/20260923000004_assistance_location_matching.sql
   - supabase/migrations/20260923000005_assistance_contact_exchange.sql
   - supabase/migrations/20260923000006_add_expired_trip_status.sql
   - supabase/migrations/20260923000007_expire_stale_trips.sql
   - supabase/migrations/20260924000000_fix_expired_status_constraint.sql
   - supabase/migrations/20260924000001_volunteer_cancel_accepted_trip.sql
   - supabase/migrations/20260924000002_assistance_expiry_and_cancel.sql
   - supabase/migrations/20260924071143_volunteer_vehicle_details.sql
   - supabase/migrations/20260924080000_roadside_assistance_details.sql
4. انشر الوظائف المطلوبة، وبضمنها create-trip-proxy وsend-push.
5. اضبط متغيرات بيئة الوظيفة: SUPABASE_URL وSUPABASE_ANON_KEY وSUPABASE_SERVICE_ROLE_KEY وALLOWED_ORIGINS. لا تضع مفتاح الخدمة في الواجهة الأمامية.

## تسجيل الدخول باستخدام Google

فعّل Google من Supabase Authentication → Providers، ثم أضف نطاق النشر إلى Site URL وRedirect URLs. أدخل الاسم والهاتف، وأدخل بيانات السيارة وإقرار المسؤولية عند التسجيل كشهم.

## التشغيل المحلي

    npm install
    # أضف VITE_SUPABASE_ANON_KEY إلى ملف .env
    npm run dev

## ملاحظات بيانات

- المسافة المعروضة للمستفيد هي المسافة المحسوبة عند قبول الطلب؛ لا نعرض إحداثيات موقع الشهم الدقيقة.
- الطلبات القديمة التي لا تحتوي على تصنيف مشكلة تحصل على التصنيف العام عند تطبيق الترحيل.
- بيانات السيارة المثبتة لا يمكن تغييرها من حساب المستخدم بعد الإقرار.
