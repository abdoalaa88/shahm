# شَهْم | Shahm

تطبيق ويب تقدّمي (PWA) بيربط **المستفيدين** اللي محتاجين مشوار أو عون على الطريق بـ**شهم** (متطوع) قريب منهم، بنطاق ٧ كيلومتر، وبحماية لبيانات الطرفين لحد ما الطلب يتقبل.

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS (RTL) · Supabase (Postgres + RLS + Edge Functions) · Cloudflare Pages · Web Push

## المميزات

- **طلب مشوار فوري:** المستفيد يبعت طلب، أقرب شهم يقبله، وبعدها بس بيتكشف رقم التواصل. الطلب بينتهي تلقائيًا لو محدش قبله.
- **عون على الطريق:** طلبات مساعدة (عطل، بنزين، إلخ) بتوصل للشهم القريب، مع تبادل بيانات التواصل بعد القبول.
- **أدوار متعددة:** نفس الحساب ممكن يبقى شهم ومستفيد، ولكل دور بروفايل مستقل.
- **إشعارات Web Push** وتثبيت كتطبيق على الموبايل، مع صفحة offline.
- **لوحة إدارة** (`ops_admin` / `verification_admin` / `analytics_viewer`): مراجعة البلاغات، المستخدمين، التحليلات، ومراقبة الاستهلاك.

## هيكل المشروع

```
src/
  App.tsx              المنسّق: يجمع الـ hooks والـ handlers المشتركة ويوجّه للشاشات
  screens/             الشاشات الكاملة (تحميل، دخول، إعداد الحساب، إيقاف، خطأ)
  hooks/               useAuthProfile, useAuthFlow, useVolunteerFeed, useAssistance, useRoleSubscriptions
  features/
    requester/         واجهة المستفيد (الطلب الحالي + نموذج الطلب)
    volunteer/         واجهة الشهم (المشاوير، عون الطريق، الطلبات القريبة)
    admin/             شريط تبويبات الأدمن وصلاحيات الأدوار
    shared/            الإرشادات وحسابي (مشتركة بين الدورين)
  components/
    admin/             لوحات الإدارة (تحليلات، أمان، مستخدمين، استهلاك)
    common/            مكونات مشتركة (الهيدر، التنقل السفلي، المقولة، لودر الانتظار، ملخص المشوار، البلاغات...)
  lib/
    supabase.ts        عميل Supabase والأنواع
    apiErrors.ts       translateApiError (ترجمة رسائل الـ RPC)
    constants.ts, appTypes.ts   ثوابت وأنواع مشتركة
    push.ts            تسجيل الإشعارات واستدعاء دوال الإشعار
    phone.ts           تطبيع أرقام الهاتف لروابط واتساب
  sw.ts                Service Worker (Workbox)
supabase/
  migrations/          مخطط قاعدة البيانات بالترتيب الزمني (المصدر الوحيد للحقيقة)
  functions/           Edge Functions (create-trip-proxy, send-push, notify-*)
design/stitch/         مرجع تصميم الشاشات (للاطلاع فقط، مش جزء من البناء)
docs/                  وثائق المعمارية والتاريخ
public/                أيقونة الـ PWA، offline.html، _headers، _redirects
```

## التشغيل محليًا

المتطلبات: Node.js 20+ (الـ devcontainer بيستخدم 22).

```bash
npm install
cp .env.example .env      # واملأ القيم الحقيقية
npm run dev
```

| الأمر | الغرض |
| --- | --- |
| `npm run dev` | سيرفر التطوير |
| `npm run typecheck` | فحص TypeScript |
| `npm run build` | بناء نسخة الإنتاج (`dist/`) |
| `npm run preview` | معاينة نسخة الإنتاج |

## قاعدة البيانات والدوال

```bash
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push                      # تطبيق الـ migrations
npx supabase functions deploy <function>  # نشر Edge Function
```

الـ secrets الخاصة بالدوال (`service_role`، مفتاح VAPID الخاص) بتتضبط في Supabase فقط ومش بتتكتب في الريبو أو `.env`. التفاصيل والـ conventions في [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## النشر

الموقع بيتنشر على **Cloudflare Pages** (build command: `npm run build`، output: `dist`). ضبط الـ headers والـ SPA fallback في `public/_headers` و`public/_redirects`.

قبل تشغيل تسجيل الدخول بجوجل على أي دومين (production أو preview)، ضيف الدومين في Supabase → Authentication → URL Configuration → Redirect URLs.

## ملاحظات للمساهمين

- كل تغيير في قاعدة البيانات يتعمل كـ migration جديدة بترقيم زمني، وما بنعدّلش migration اتطبقت.
- نصوص الواجهة بالعربي المصري العامي، وما بنغيّرش نظام التصميم الموجود.
- سجل التغييرات في [`CHANGELOG.md`](CHANGELOG.md).
