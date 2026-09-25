/**
 * أدوات تطبيع أرقام الهاتف.
 *
 * Numbers without a country prefix default to Egypt (+20).
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
