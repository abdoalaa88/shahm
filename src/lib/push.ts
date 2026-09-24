import { supabase, type UserRole } from './supabase';

/**
 * Web Push helpers.
 *
 * Requires `VITE_VAPID_PUBLIC_KEY` and the `push_subscriptions` table
 * (one row per profile, keyed by `user_id`). Subscriptions are bound to the
 * profile of the role the user is currently acting as, because one account
 * can hold both a volunteer and a requester profile.
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

export async function registerPushNotifications(role: UserRole): Promise<boolean> {
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', userId)
      .eq('role', role)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (profileError || !profile) return false;

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: profile.id,
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

export async function notifyTripAccepted(tripId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('notify-trip-accepted', {
      body: { trip_id: tripId },
    });
    if (error) {
      console.error('Acceptance notification request failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Acceptance notification request failed:', err);
    return false;
  }
}

export async function notifyAssistanceAccepted(assistanceId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('notify-assistance-accepted', {
      body: { assistance_id: assistanceId },
    });
    if (error) {
      console.error('Assistance acceptance notification request failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Assistance acceptance notification request failed:', err);
    return false;
  }
}
