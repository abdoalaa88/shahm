import { supabase } from './supabase';

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

export async function registerPushNotifications(
  profileId?: string,
  options: { requestPermission?: boolean } = {},
): Promise<boolean> {
  if (
    !window.isSecureContext ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined'
  ) {
    console.warn('Push notifications are not supported in this browser.');
    return false;
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.error('VITE_VAPID_PUBLIC_KEY is not configured.');
    return false;
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default' && options.requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!options.requestPermission) return false;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return false;

    let subscriptionProfileId = profileId;
    if (!subscriptionProfileId) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', authUserId)
        .limit(1);
      if (profileError) throw profileError;
      subscriptionProfileId = profiles?.[0]?.id;
    }
    if (!subscriptionProfileId) return false;

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        // push_subscriptions.user_id references profiles.id, not auth.users.id.
        user_id: subscriptionProfileId,
        endpoint: subscription.endpoint,
        subscription: JSON.parse(JSON.stringify(subscription.toJSON())),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    return !error;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}
