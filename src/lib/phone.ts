/**
 * أدوات تطبيع أرقام الهاتف.
 *
 * ملاحظة إصلاح: كان الكود الأصلي يستخدم
 * `phone.replace(/\+/g, '')` مباشرة كرقم واتساب (wa.me/<phone>).
 * لو تم تخزين الرقم بصيغة محلية (مثال: 01012345678 بدون كود دولة)،
 * فإن رابط wa.me يصبح غير صالح لأن واتساب يشترط الصيغة الدولية الكاملة
 * بدون علامة + وبدون صفر بداية الرقم المحلي.
 *
 * الحل: تطبيع الرقم دائماً إلى صيغة دولية قبل إنشاء رابط wa.me،
 * مع افتراض كود الدولة الافتراضي +20 (مصر) حين لا يحتوي الرقم
 * على كود دولة أصلاً. عدّل DEFAULT_COUNTRY_CODE إذا اختلف السياق.
 */
const DEFAULT_COUNTRY_CODE = '20';

export function toWhatsAppNumber(rawPhone: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string {
  const digitsOnly = rawPhone.replace(/[^\d+]/g, '');

  if (digitsOnly.startsWith('+')) {
    return digitsOnly.slice(1);
  }

  // صيغة محلية تبدأ بصفر (مثال: 01012345678) → احذف الصفر وأضف كود الدولة
  if (digitsOnly.startsWith('0')) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  // الرقم يبدأ بكود الدولة بالفعل بدون +
  if (digitsOnly.startsWith(defaultCountryCode)) {
    return digitsOnly;
  }

  return `${defaultCountryCode}${digitsOnly}`;
}

export function toTelHref(rawPhone: string): string {
  const digitsOnly = rawPhone.replace(/[^\d+]/g, '');
  return digitsOnly.startsWith('+') ? digitsOnly : `+${toWhatsAppNumber(digitsOnly)}`;
}
