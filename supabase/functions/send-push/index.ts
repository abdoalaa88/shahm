// Sends Web Push notifications (VAPID) to volunteers' registered devices
// (public.push_subscriptions). Not publicly callable: only a caller holding
// the service-role key may invoke it — it's meant to be triggered from
// create-trip-proxy right after a trip is successfully created, never
// directly from the browser.
// New-trip notifications go only to active volunteers near the pick-up point.

type PushPayload = {
  user_ids?: string[];
  trip_id?: string;
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

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY') ?? Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@shahm.app';

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse(500, { error: 'Push function environment is incomplete' });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
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
    return jsonResponse(200, { sent: 0, failed: 0 });
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
          console.error('push send failed', { user_id: row.user_id, statusCode });
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

  return jsonResponse(200, { sent, failed, stale: staleEndpoints.size });
});
