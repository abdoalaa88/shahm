// Called by the volunteer's browser right after accept_trip succeeds, to
// push-notify the requester that someone accepted their trip. Re-verifies
// the caller is genuinely the trip's assigned volunteer via a service-role
// lookup before sending anything, so a forged trip_id can't be used to
// spam an arbitrary requester.

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const jsonHeaders = (request: Request) => {
  const requestOrigin = request.headers.get('origin') ?? '';
  const allowOrigin = allowedOrigins.includes('*') ? '*' : requestOrigin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};

const isAllowedOrigin = (request: Request) => {
  const requestOrigin = request.headers.get('origin');
  return (
    allowedOrigins.includes('*') ||
    (!!requestOrigin && allowedOrigins.includes(requestOrigin))
  );
};

const response = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders(request) });

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) {
    return response(request, 403, { error: 'Origin not allowed' });
  }
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: jsonHeaders(request) });
  }
  if (request.method !== 'POST') {
    return response(request, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return response(request, 500, { error: 'Function environment is incomplete' });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return response(request, 401, { error: 'Authentication required' });
  }

  let payload: { trip_id?: string };
  try {
    payload = await request.json();
  } catch {
    return response(request, 400, { error: 'Request body must be valid JSON' });
  }

  if (!payload.trip_id || typeof payload.trip_id !== 'string') {
    return response(request, 422, { error: 'trip_id is required' });
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const accessToken = authorization.slice('Bearer '.length).trim();

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return response(request, 401, { error: 'Invalid authentication token' });
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: trip, error: tripError } = await serviceClient
    .from('trips')
    .select('id, requester_id, volunteer_id, status, origin_area_label, destination_area_label')
    .eq('id', payload.trip_id)
    .maybeSingle();

  if (tripError || !trip) {
    return response(request, 404, { error: 'Trip not found' });
  }
  if (trip.volunteer_id !== userData.user.id || trip.status !== 'accepted') {
    return response(request, 403, { error: 'Not authorized to notify for this trip' });
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        user_ids: [trip.requester_id],
        title: 'تم قبول طلبك 🎉',
        body: `أحد المتطوعين في طريقه إليك (${trip.origin_area_label} ⟶ ${trip.destination_area_label})`,
        url: '/',
        tag: `trip-${trip.id}`,
      }),
    });
  } catch (pushError) {
    console.error('notify requester push failed', pushError);
  }

  return response(request, 200, { ok: true });
});
