import { supabase } from './supabase';

/**
 * ملاحظة إصلاح: كان مكوّن StateViews.tsx يستورد
 * `registerPushNotifications` من './lib/push' لكن هذا الملف
 * لم يكن موجوداً إطلاقاً في التسليم الأصلي — وهو خطأ بناء (build-breaking)
 * لأن الاستيراد كان سيفشل فوراً في npm run build.
 *
 * التنفيذ أدناه يفترض:
 * - وجود VITE_VAPID_PUBLIC_KEY في متغيرات البيئة.
 * - وجود جدول push_subscriptions (مذكور في تقرير Supabase الأصلي)
 *   بأعمدة تخزّن اشتراك الـ Push Subscription لكل مستخدم.
 * يجب مراجعته مقابل مخطط قاعدة البيانات الفعلي بعد توفير ملف المايجريشن الكامل.
 */

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }

  return output.buffer as ArrayBuffer;
}

export async function registerPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.');
    return false;
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is not configured.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return false;

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        subscription: JSON.parse(JSON.stringify(subscription.toJSON())),
      },
      { onConflict: 'user_id' }
    );

    return !error;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}
