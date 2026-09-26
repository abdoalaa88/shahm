// Sends Web Push notifications (VAPID) to volunteers' registered devices
// (public.push_subscriptions). Not publicly callable: only a caller holding
// the service-role key may invoke it — it's meant to be triggered from
// create-trip-proxy right after a trip is successfully created, never
// directly from the browser.
// New-trip notifications go only to active volunteers near the pick-up point.

type PushPayload = {
  user_ids?: string[];
  trip_id?: string;
  assistance_id?: string;
  type?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Notification targeting for new trips (see get_nearby_volunteer_ids).
const NEARBY_RADIUS_KM = 20;
// Bound provider/database work instead of opening thousands of requests at once.
const SEND_CONCURRENCY = 20;
const LOCATION_MAX_AGE_MINUTES = 180;

const localDevelopmentOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = [
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  'https://shahm-eg.pages.dev',
  ...localDevelopmentOrigins,
];

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes('*') ? '*' : origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
});

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  request?: Request,
) => {
  const origin = request?.headers.get('origin') ?? '';
  const headers = origin && allowedOrigins.includes(origin)
    ? corsHeaders(origin)
    : { 'Content-Type': 'application/json' };
  return new Response(JSON.stringify(body), { status, headers });
};

function base64UrlToBytes(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Detect a mismatched server key pair before the push provider rejects every send.
async function vapidKeysMatch(publicKey: string, privateKey: string): Promise<boolean> {
  try {
    const publicBytes = base64UrlToBytes(publicKey);
    const privateBytes = base64UrlToBytes(privateKey);
    if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) return false;

    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64Url(publicBytes.slice(1, 33)),
      y: bytesToBase64Url(publicBytes.slice(33, 65)),
      d: bytesToBase64Url(privateBytes),
      ext: true,
      key_ops: ['sign'],
    };
    const signer = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const verifier = await crypto.subtle.importKey(
      'raw',
      publicBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const challenge = new TextEncoder().encode('shahm-vapid-key-check');
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signer,
      challenge,
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifier,
      signature,
      challenge,
    );
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY') ?? Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@shahm.app';

  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') ?? '';
    if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === 'GET') {
    const origin = request.headers.get('origin') ?? '';
    if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
      return jsonResponse(403, { error: 'Origin not allowed' });
    }
    if (!vapidPublicKey || !vapidPrivateKey || !(await vapidKeysMatch(vapidPublicKey, vapidPrivateKey))) {
      console.error('Push configuration is missing or VAPID keys do not match.');
      return jsonResponse(503, { error: 'Push configuration is invalid' }, request);
    }
    // The VAPID public key is public by design. This endpoint keeps it in sync with sending.
    return jsonResponse(200, { vapidPublicKey }, request);
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, request);
  }

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse(500, { error: 'Push function environment is incomplete' });
  }
  if (!(await vapidKeysMatch(vapidPublicKey, vapidPrivateKey))) {
    console.error('Push request blocked because the VAPID public/private keys do not match.');
    return jsonResponse(500, { error: 'Push configuration is invalid' });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader !== \`Bearer \${serviceRoleKey}\`) {
    return jsonResponse(401, { error: 'Not authorized to trigger push notifications' });
  }

  let payload: PushPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON' });
  }

  if (!payload.title || !payload.body) {
    return jsonResponse(422, { error: 'title and body are required' });
  }
  if ((!payload.user_ids || payload.user_ids.length === 0) && !payload.trip_id) {
    return jsonResponse(422, { error: 'Provide either user_ids or trip_id' });
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const webpush = await import('npm:web-push@3.6.7');

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetUserIds = payload.user_ids ?? [];

  if (payload.trip_id && targetUserIds.length === 0) {
    // Match active volunteers within the existing 20 km radius whose last
    // known location was refreshed within the existing 3-hour window.
    // App presence is deliberately not part of push eligibility.
    const { data: nearby, error: nearbyError } = await serviceClient.rpc(
      'get_nearby_volunteer_ids',
      {
        p_trip_id: payload.trip_id,
        p_radius_km: NEARBY_RADIUS_KM,
        p_max_age_minutes: LOCATION_MAX_AGE_MINUTES,
      },
    );

    if (nearbyError) {
      console.error('get_nearby_volunteer_ids failed', {
        code: nearbyError.code,
        message: nearbyError.message,
      });
      return jsonResponse(500, { error: 'Could not resolve nearby volunteers' });
    }

    targetUserIds = (nearby ?? []).map((row: { user_id: string }) => row.user_id);
  }

  targetUserIds = [...new Set(targetUserIds)];

  if (targetUserIds.length === 0) {
    console.info('No nearby active volunteers matched this trip.');
    return jsonResponse(200, { sent: 0, failed: 0, targets: 0, subscriptions: 0 });
  }

  // Keep PostgREST URL size predictable when a nearby event has many
  // eligible recipients. Each profile can still have multiple device rows.
  const userIdBatches: string[][] = [];
  for (let index = 0; index < targetUserIds.length; index += 200) {
    userIdBatches.push(targetUserIds.slice(index, index + 200));
  }

  const subscriptionResults = await Promise.all(
    userIdBatches.map((userIds) =>
      serviceClient
        .from('push_subscriptions')
        .select('user_id, endpoint, subscription')
        .in('user_id', userIds)
    ),
  );
  const failedSubscriptionQuery = subscriptionResults.find((result) => result.error);
  if (failedSubscriptionQuery?.error) {
    console.error('Could not load push subscriptions', {
      code: failedSubscriptionQuery.error.code,
      message: failedSubscriptionQuery.error.message,
    });
    return jsonResponse(500, { error: 'Could not load push subscriptions' });
  }
  const subscriptions = subscriptionResults.flatMap((result) => result.data ?? []);

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    type: payload.type ?? (payload.trip_id ? 'trip' : payload.assistance_id ? 'assistance' : 'general'),
    trip_id: payload.trip_id,
    assistance_id: payload.assistance_id,
    tag: payload.tag ?? (payload.trip_id ? `trip-${payload.trip_id}` : undefined),
  });

  let sent = 0;
  let failed = 0;
  const staleEndpoints = new Set<string>();
  const rows = subscriptions ?? [];
  let nextIndex = 0;

  // Keep fan-out bounded for projects with thousands of subscriptions.
  const sendWorker = async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex++];
      try {
        await webpush.sendNotification(row.subscription, notificationPayload);
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Preserve subscription rows during this audit; report stale endpoints
          // without deleting user/device data.
          staleEndpoints.add(row.endpoint);
        } else {
          // Never log endpoints or user details; provider status is enough to diagnose.
          console.error('push send failed', { statusCode });
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, rows.length) }, () => sendWorker()),
  );

  if (staleEndpoints.size > 0) {
    console.warn('Expired push endpoints were detected and left intact by policy', { count: staleEndpoints.size });
  }

  console.info('Push delivery completed', {
    targets: targetUserIds.length,
    subscriptions: rows.length,
    sent,
    failed,
    stale: staleEndpoints.size,
  });
  return jsonResponse(200, {
    targets: targetUserIds.length,
    subscriptions: rows.length,
    sent,
    failed,
    stale: staleEndpoints.size,
  });
});
