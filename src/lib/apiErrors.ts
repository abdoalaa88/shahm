// Maps the English `raise exception` messages of the latest active RPC definitions
// (supabase/migrations) to Egyptian-Arabic UI text. Unknown messages fall through as-is.
export const translateApiError = (message: string): string => {
  const map: Array<[string, string]> = [
    // Roles / auth
    ['volunteer role required', 'الميزة دي لصلاحية الشهم بس.'],
    ['administrator role required', 'الميزة دي للأدمن بس.'],
    ['role changes are managed by administrators', 'تغيير الدور بيتم من الإدارة بس.'],
    ['verification status changes are managed by administrators', 'تغيير حالة التوثيق بيتم من الإدارة بس.'],
    ['account status changes are managed by administrators', 'تغيير حالة الحساب بيتم من الإدارة بس.'],
    ['service role required', 'العملية دي مش متاحة من التطبيق.'],
    ['requester and trusted client IP are required', 'مقدرناش نتأكد من اتصالك. سجّل دخول تاني وجرّب.'],
    ['authentication and trusted client IP are required', 'مقدرناش نتأكد من اتصالك. سجّل دخول تاني وجرّب.'],
    // Location
    ['volunteer location must be within Egypt', 'موقعك الحالي لازم يكون جوه مصر.'],
    ['assistance location must be within Egypt', 'موقع طلب العون لازم يكون جوه مصر.'],
    // Trips
    ['trip is no longer available', 'الطلب ده اتقبل من شهم تاني.'],
    ['one open trip is allowed', 'عندك طلب مفتوح بالفعل، استنى يخلص الأول.'],
    // Must stay above the generic 'trip cannot be cancelled' entry: matching is first-hit by substring.
    ['trip cannot be cancelled by this volunteer', 'مينفعش تلغي الرحلة دي دلوقتي.'],
    ['trip cannot be cancelled', 'مينفعش تلغي الطلب ده في حالته الحالية.'],
    ['trip cannot be completed', 'مينفعش تنهي الطلب ده في حالته الحالية.'],
    ['passenger count must be between 1 and 4', 'عدد المرافقين لازم يكون من ١ لـ ٤.'],
    ['special notes are too long', 'الملاحظات طويلة أوي، اختصرها شوية.'],
    // Reports (submit_report / resolve_report)
    ['valid report required', 'اكتب سبب البلاغ (٥ حروف على الأقل) وتأكد إنك مسجّل دخول.'],
    ['p_report_id and p_status are required', 'بيانات البلاغ ناقصة، جرّب تاني.'],
    ['p_status must be reviewed, dismissed or actioned', 'حالة البلاغ مش مظبوطة.'],
    ['report not found or is not pending', 'البلاغ ده اتراجع قبل كده أو مش موجود.'],
    // Roadside assistance
    ['invalid assistance issue', 'نوع المشكلة مش مظبوط، اختار نوع من القايمة.'],
    ['assistance description is required', 'اكتب وصف المشكلة قبل ما تبعت الطلب.'],
    ['assistance request is no longer available', 'طلب العون ده اتقبل أو اتقفل.'],
    ['assistance request is outside the available range', 'طلب العون ده بره نطاق الـ٧ كيلومتر منك.'],
    ['assistance request cannot be completed', 'مينفعش تنهي طلب العون ده في حالته الحالية.'],
    ['assistance request cannot be cancelled', 'مينفعش تلغي طلب العون ده في حالته الحالية.'],
    ['one open assistance request is allowed', 'عندك طلب عون مفتوح بالفعل، استنى يخلص أو الغيه الأول.'],
  ];
  const match = map.find(([needle]) => message.includes(needle));
  return match ? match[1] : message;
};
