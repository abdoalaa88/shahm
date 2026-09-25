// Authenticated client notification bridge for a committed medical-trip
// cancellation. The RPC remains the source of truth; push delivery is best effort.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const productionOrigins = ['https://shahm-eg.pages.dev'];
const localDevelopmentOrigins = [
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'http://localhost:4174', 'http://127.0.0.1:4174',
  'http://localhost:4175', 'http://127.0.0.1:4175',
];
const allowedOrigins = [
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...productionOrigins,
  ...localDevelopmentOrigins,
];

const headers = (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const allowOrigin = allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(origin)
    ? origin
    : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};

const respond = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: headers(request) });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!allowedOrigins.includes('*') && (!origin || !allowedOrigins.includes(origin))) {
    return respond(request, 403, { error: 'Origin not allowed' });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== 'POST') return respond(request, 405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(request, 500, { error: 'Function environment is incomplete' });
  }
  if (!authorization.startsWith('Bearer ')) {
    return respond(request, 401, { error: 'Authentication required' });
  }

  let payload: { trip_id?: unknown; event_id?: unknown };
  try {
    payload = await request.json();
  } catch {
    return respond(request, 400, { error: 'Request body must be valid JSON' });
  }
  if (!isUuid(payload.trip_id) || !isUuid(payload.event_id)) {
    return respond(request, 422, { error: 'trip_id and event_id must be UUIDs' });
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const accessToken = authorization.slice('Bearer '.length).trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) return respond(request, 401, { error: 'Invalid authentication token' });

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: trip, error: tripError } = await service
    .from('trips')
    .select('id,requester_id,volunteer_id,status,cancellation_reason,last_cancellation_actor_profile_id,last_cancellation_actor_role,cancellation_event_id,origin_area_label,destination_area_label')
    .eq('id', payload.trip_id)
    .maybeSingle();
  if (tripError || !trip) return respond(request, 404, { error: 'Trip not found' });

  // A Google account can own both a requester and volunteer profile; bind
  // authorization to the exact actor profile recorded by the cancellation RPC.
  const { data: actor, error: actorError } = await service
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', trip.last_cancellation_actor_profile_id)
    .eq('auth_user_id', authData.user.id)
    .eq('role', trip.last_cancellation_actor_role)
    .maybeSingle();
  if (actorError || !actor?.is_active) return respond(request, 403, { error: 'Active profile required' });

  if (
    trip.cancellation_event_id !== payload.event_id.toLowerCase() ||
    trip.last_cancellation_actor_profile_id !== actor.id ||
    trip.last_cancellation_actor_role !== actor.role
  ) {
    return respond(request, 403, { error: 'Not authorized for this cancellation event' });
  }

  const volunteerCancelled = actor.role === 'volunteer' && trip.status === 'pending' && trip.volunteer_id === null;
  const requesterCancelled = actor.role === 'requester' && trip.status === 'cancelled' && trip.requester_id === actor.id;
  if (!volunteerCancelled && !requesterCancelled) {
    return respond(request, 409, { error: 'Trip cancellation state has changed' });
  }

  const recipientProfileId = volunteerCancelled ? trip.requester_id : trip.volunteer_id;
  if (!recipientProfileId) return respond(request, 200, { ok: true, recipient: false });

  const { error: claimError } = await service.from('trip_cancellation_notifications').insert({
    event_id: payload.event_id,
    trip_id: trip.id,
    actor_profile_id: actor.id,
    recipient_profile_id: recipientProfileId,
    notification_kind: volunteerCancelled ? 'volunteer_cancelled' : 'requester_cancelled',
  });
  if (claimError?.code === '23505') return respond(request, 200, { ok: true, already_notified: true });
  if (claimError) {
    console.error('Claiming cancellation notification failed:', claimError);
    return respond(request, 500, { error: 'Could not record cancellation notification' });
  }

  const sendPush = async (userIds: string[], title: string, body: string, tag: string) => {
    if (!userIds.length) return;
    const result = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ user_ids: userIds, title, body, url: '/', tag }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!result.ok) console.error('Cancellation push delivery failed:', result.status, await result.text());
  };

  const reason = trip.cancellation_reason?.trim();
  try {
    if (volunteerCancelled) {
      await sendPush(
        [trip.requester_id],
        'تحديث بخصوص طلب النقل',
        `اعتذر المتطوع عن إكمال الرحلة${reason ? ` بسبب: ${reason}` : ''}. طلبك ما زال قائمًا وسيظهر لمتطوعين آخرين قريبين منك.`,
        `trip-cancelled-${trip.id}`,
      );

      // Notify other nearby, online volunteers that the request is available again.
      const { data: nearby, error: nearbyError } = await service.rpc('get_nearby_volunteer_ids', {
        p_trip_id: trip.id,
        p_radius_km: 7,
        p_max_age_minutes: 180,
      });
      if (nearbyError) {
        console.error('Resolving volunteers for reopened trip failed:', nearbyError);
      } else {
        const otherVolunteerIds = (nearby ?? [])
          .map((row: { user_id: string }) => row.user_id)
          .filter((profileId: string) => profileId !== actor.id);
        await sendPush(
          otherVolunteerIds,
          'طلب نقل مريض متاح بالقرب منك',
          'عاد طلب نقل مريض للانتظار بعد اعتذار المتطوع السابق.',
          `trip-reopened-${trip.id}`,
        );
      }
    } else {
      await sendPush(
        [recipientProfileId],
        'تحديث بخصوص الرحلة',
        `ألغى طالب المساعدة الرحلة${reason ? ` بسبب: ${reason}` : ''}. أجرك على نيتك محفوظ بإذن الله؛ وعلى نياتكم تُرزقون.`,
        `trip-cancelled-${trip.id}`,
      );
    }
  } catch (pushError) {
    // Cancellation is already committed; notification failures must not undo it.
    console.error('Sending cancellation push failed:', pushError);
  }

  return respond(request, 200, { ok: true });
});

