type RequesterRelation = 'patient' | 'guardian' | 'companion';

type CreateTripPayload = {
  origin_area_label: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_area_label: string;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  requester_relation: RequesterRelation;
  people_count: number;
  request_notes: string;
  patient_profile_id: string;
};

const localDevelopmentOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
];

const productionOrigins = [
  // The deployed Cloudflare Pages site was returning 403 for its OPTIONS preflight.
  'https://shahm-eg.pages.dev',
];

const allowedOrigins = [
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...productionOrigins,
  ...localDevelopmentOrigins,
];

const jsonHeaders = (request: Request) => {
  const requestOrigin = request.headers.get('origin') ?? '';
  const allowOrigin = allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : 'null';

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

const response = (
  request: Request,
  status: number,
  body: Record<string, unknown>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders(request),
  });

const isFiniteCoordinate = (
  value: unknown,
  min: number,
  max: number,
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isText = (
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string =>
  typeof value === 'string' &&
  value.trim().length >= minLength &&
  value.trim().length <= maxLength;

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const validatePayload = (
  payload: unknown,
): payload is CreateTripPayload => {
  if (!payload || typeof payload !== 'object') return false;

  const data = payload as Partial<CreateTripPayload>;

  return (
    isText(data.origin_area_label, 1, 160) &&
    isText(data.origin_address, 1, 500) &&
    isFiniteCoordinate(data.origin_lat, -90, 90) &&
    isFiniteCoordinate(data.origin_lng, -180, 180) &&
    isText(data.destination_area_label, 1, 160) &&
    isText(data.destination_address, 1, 500) &&
    isFiniteCoordinate(data.destination_lat, -90, 90) &&
    isFiniteCoordinate(data.destination_lng, -180, 180) &&
    (
      data.requester_relation === 'patient' ||
      data.requester_relation === 'guardian' ||
      data.requester_relation === 'companion'
    ) &&
    typeof data.people_count === 'number' &&
    Number.isInteger(data.people_count) &&
    data.people_count >= 1 &&
    data.people_count <= 8 &&
    typeof data.request_notes === 'string' &&
    data.request_notes.length <= 500 &&
    isUuid(data.patient_profile_id)
  );
};

// Fire-and-forget notification to nearby volunteers. Never allowed to
// fail or slow down trip creation itself — the trip already exists in the
// database by the time this runs, so a push failure here is a lost
// notification, not a lost trip.
const notifyVolunteers = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  tripId: string,
  data: CreateTripPayload,
) => {
  try {
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        trip_id: tripId,
        title: 'طلب نقل مريض جديد قريب منك',
        body: `نقل مريض · من ${data.origin_area_label.trim()} إلى ${data.destination_area_label.trim()} · الآن`,
        url: '/',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const pushResult = await pushResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!pushResponse.ok) {
      console.error('send-push request failed', {
        status: pushResponse.status,
        error: pushResult.error,
      });
      return;
    }
    console.info('send-push delivery result', {
      targets: pushResult.targets,
      subscriptions: pushResult.subscriptions,
      sent: pushResult.sent,
      failed: pushResult.failed,
      stale: pushResult.stale,
    });
  } catch (pushError) {
    console.error('notifyVolunteers failed', pushError);
  }
};

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) {
    return response(request, 403, {
      error: 'Origin not allowed',
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: jsonHeaders(request),
    });
  }

  if (request.method !== 'POST') {
    return response(request, 405, {
      error: 'Method not allowed',
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get(
    'SUPABASE_SERVICE_ROLE_KEY',
  );

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey
  ) {
    return response(request, 500, {
      error: 'Supabase function environment is incomplete',
    });
  }

  const { createClient } = await import(
    'npm:@supabase/supabase-js@2.45.4'
  );

  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return response(request, 401, {
      error: 'Authentication required',
    });
  }

  const trustedIp = request.headers.get('cf-connecting-ip');

  if (!trustedIp) {
    return response(request, 400, {
      error: 'Trusted client IP is unavailable',
    });
  }

  const contentLength = Number(
    request.headers.get('content-length') ?? 0,
  );

  if (contentLength > 32_768) {
    return response(request, 413, {
      error: 'Request payload is too large',
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return response(request, 400, {
      error: 'Request body must be valid JSON',
    });
  }

  if (!validatePayload(payload)) {
    return response(request, 422, {
      error: 'بيانات طلب النقل غير صحيحة. راجع المريض والمواقع والملاحظات وحاول مرة أخرى.',
    });
  }

  const accessToken = authorization
    .slice('Bearer '.length)
    .trim();

  const userClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: userData, error: userError } =
    await userClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return response(request, 401, {
      error: 'Invalid authentication token',
    });
  }

  const { data: requesterProfile, error: requesterProfileError } =
    await userClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .eq('role', 'requester')
      .eq('is_active', true)
      .maybeSingle();

  if (requesterProfileError || !requesterProfile) {
    console.error('requester profile lookup failed', {
      code: requesterProfileError?.code,
      message: requesterProfileError?.message,
    });
    return response(request, 403, {
      error: 'ملف طالب المساعدة غير موجود أو غير نشط',
    });
  }

  const serviceClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const data = payload as CreateTripPayload;

  const { data: tripId, error: tripError } =
    await serviceClient.rpc('create_medical_trip_from_proxy', {
      p_requester_id: requesterProfile.id,
      p_origin_area_label: data.origin_area_label.trim(),
      p_origin_address: data.origin_address.trim(),
      p_origin_lat: data.origin_lat,
      p_origin_lng: data.origin_lng,
      p_destination_area_label:
        data.destination_area_label.trim(),
      p_destination_address:
        data.destination_address.trim(),
      p_destination_lat: data.destination_lat,
      p_destination_lng: data.destination_lng,
      p_requester_relation: data.requester_relation,
      // Immediate trip requests use the database clock as the source of truth.
      p_scheduled_at: new Date().toISOString(),
      p_people_count: data.people_count,
      p_request_notes: data.request_notes.trim(),
      p_patient_profile_id: data.patient_profile_id,
      p_client_ip: trustedIp,
    });

  if (tripError) {
    console.error('create_trip failed', {
      code: tripError.code,
      message: tripError.message,
    });

    return response(request, 400, {
      error: 'تعذر إنشاء طلب النقل',
    });
  }

  // Keep push delivery out of the request/response path so notification
  // delays cannot make a successfully created trip appear to fail.
  EdgeRuntime.waitUntil(
    notifyVolunteers(supabaseUrl, supabaseServiceRoleKey, tripId as string, data),
  );

  return response(request, 201, {
    trip_id: tripId,
  });
});

