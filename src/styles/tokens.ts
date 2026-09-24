/**
 * Shahm Design Tokens (PRD §7.1.1 WCAG AA Certified)
 */
export const tokens = {
  colors: {
    brand: {
      decorative: '#1E8E5A', // زخرفي للأيقونات فقط (لا يستخدم خلف نص أبيض)
      button: '#146B44',     // الأزرار الأساسية بنص أبيض (تباين 6.53:1 ✅)
      pressed: '#0F5636',    // حالة الضغط (تباين 8.40:1 ✅)
      light: '#E6F4ED',      // خلفية الشارة الخضراء (مع نص #146B44، تباين 5.76:1 ✅)
    },
    action: {
      blue: '#2F6FED',       // الروابط والتنبيهات (تباين 4.55:1 ✅)
    },
    status: {
      pending: {
        bg: '#FBEFDC',
        text: '#8F5A0A',     // تباين 5.08:1 فوق خلفية الشارة ✅
      },
      accepted: {
        bg: '#E6F4ED',
        text: '#146B44',
      },
      completed: {
        bg: '#EEF0EF',
        text: '#4B5A52',     // تباين 6.36:1 ✅
      },
      cancelled: {
        bg: '#FCEAEA',
        text: '#B53A3A',     // تباين 4.98:1 فوق الشارة ✅
        button: '#B53A3A',   // زر الخطر بنص أبيض (تباين 5.78:1 ✅)
      },
    },
    neutral: {
      textPrimary: '#1F2430',   // النص الأساسي (تباين 15.52:1 فوق الأبيض ✅)
      textSecondary: '#6B7280', // النص المساعد (تباين 4.83:1 فوق الأبيض ✅)
      background: '#F7F8F9',
      card: '#FFFFFF',
      borderDefault: '#8A949E', // حدود العناصر التفاعلية (تباين 3.08:1 ✅)
    },
  },
  typography: {
    fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', system-ui, sans-serif",
  },
} as const;
