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

  try {
    let permission = Notification.permission;
    if (permission === 'default' && options.requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

    // Use the public key from the same Supabase function that signs each push.
    // This prevents stale web builds from silently drifting from server settings.
    const { data: pushConfig, error: pushConfigError } = await supabase.functions.invoke(
      'send-push',
      { method: 'GET' },
    );
    if (pushConfigError) throw pushConfigError;
    const vapidPublicKey = pushConfig?.vapidPublicKey;
    if (typeof vapidPublicKey !== 'string' || !vapidPublicKey) {
      throw new Error('Push configuration is missing its public key.');
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    let previousEndpoint: string | null = null;
    if (subscription) {
      const currentKey = subscription.options.applicationServerKey;
      const expectedKey = new Uint8Array(urlBase64ToUint8Array(vapidPublicKey));
      const existingKey = currentKey ? new Uint8Array(currentKey) : null;
      const keyMatches = existingKey?.length === expectedKey.length &&
        expectedKey.every((byte, index) => byte === existingKey[index]);

      // A subscription remains bound to the key used when it was created.
      // Recreate stale subscriptions using the server's current public key.
      if (!keyMatches) {
        previousEndpoint = subscription.endpoint;
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
      // Renew stale subscriptions silently after permission was already granted.
      if (!options.requestPermission && !previousEndpoint) return false;
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
      // Scope this browser subscription to the signed-in profile; RLS remains owner-only.
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      console.error('Saving push subscription failed:', {
        code: error.code, message: error.message, details: error.details, hint: error.hint,
      });
      return false;
    }

    // Remove only this user's previous endpoint after its replacement is saved.
    if (previousEndpoint && previousEndpoint !== subscription.endpoint) {
      const { error: cleanupError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', subscriptionProfileId)
        .eq('endpoint', previousEndpoint);
      if (cleanupError) {
        console.warn('Could not remove the replaced push subscription:', cleanupError.code);
      }
    }
    return true;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}
