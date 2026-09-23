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
  scheduled_at?: string | null;
  passenger_count?: number;
  special_notes?: string | null;
};

const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://shahm-eg.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...configuredOrigins.filter((origin) => origin !== '*'),
]);

const jsonHeaders = (request: Request) => {
  const requestOrigin = request.headers.get('origin') ?? '';
  const allowOrigin = allowedOrigins.has(requestOrigin)
    ? requestOrigin
    : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};

const isAllowedOrigin = (request: Request) => {
  const requestOrigin = request.headers.get('origin');
  return !!requestOrigin && allowedOrigins.has(requestOrigin);
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

const isValidScheduledAt = (
  value: unknown,
): value is string | null | undefined => {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return false;

  const now = Date.now();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

  return (
    parsed.getTime() >= now - 60_000 &&
    parsed.getTime() <= now + twoDaysMs
  );
};

const isValidPassengerCount = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= 4;

const isValidSpecialNotes = (
  value: unknown,
): value is string | null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.length <= 500);

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
    isValidScheduledAt(data.scheduled_at) &&
    isValidPassengerCount(data.passenger_count ?? 1) &&
    isValidSpecialNotes(data.special_notes)
  );
};

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) {
    return response(request, 403, {
      error: 'Origin not allowed',
    });
  }

  // IMPORTANT:
  // HTTP 204 responses must NOT contain a response body.
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

  const trustedIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers
      .get('x-forwarded-for')
      ?.split(',')[0]
      .trim() ||
    '0.0.0.0';

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
      error: 'Invalid trip data',
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

  const {
    data: tripId,
    error: tripError,
  } = await serviceClient.rpc(
    'create_trip_from_proxy',
    {
      p_requester_id: userData.user.id,
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
      p_client_ip: trustedIp,
      p_scheduled_at: data.scheduled_at ?? null,
      p_passenger_count: data.passenger_count ?? 1,
      p_special_notes: data.special_notes ?? null,
    },
  );

  if (tripError) {
    console.error('create_trip failed', {
      code: tripError.code,
      message: tripError.message,
    });

    return response(request, 400, {
      error: 'Trip could not be created',
      code: tripError.code,
      details: tripError.message,
    });
  }

  try {
    const pushResponse = await fetch(
      `${supabaseUrl}/functions/v1/send-push`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trip_id: tripId,
          payload: {
            title: 'طلب رحلة قريب منك',
            body: 'يوجد طلب نقل جديد في منطقتك.',
            url: '/',
            icon: '/icons/icon-192.png',
          },
        }),
      },
    );

    if (!pushResponse.ok) {
      console.error(
        'New-trip push request failed',
        {
          status: pushResponse.status,
        },
      );
    }
  } catch (error) {
    console.error(
      'New-trip push request could not be sent',
      {
        message:
          error instanceof Error
            ? error.message
            : 'unknown error',
      },
    );
  }

  return response(request, 201, {
    trip_id: tripId,
  });
});
