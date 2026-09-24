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
  scheduled_at: string;
  problem_type: string;
  people_count: number;
  request_notes: string;
};

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

const isValidScheduledAt = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  const max = now + 48 * 60 * 60 * 1000;

  return timestamp > now && timestamp <= max;
};

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
    ['عطل ميكانيكي', 'إطار مثقوب', 'نفاد الوقود', 'بطارية السيارة', 'مشكلة كهربائية', 'حادث أو طارئ', 'أخرى'].includes(data.problem_type ?? '') &&
    typeof data.people_count === 'number' &&
    Number.isInteger(data.people_count) &&
    data.people_count >= 1 &&
    data.people_count <= 8 &&
    typeof data.request_notes === 'string' &&
    data.request_notes.length <= 500 &&
    isValidScheduledAt(data.scheduled_at)
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
    const scheduledLabel =
      Date.parse(data.scheduled_at) - Date.now() < 10 * 60 * 1000
        ? 'الآن'
        : new Date(data.scheduled_at).toLocaleString('ar-EG', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
          });

    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        trip_id: tripId,
        title: 'طلب مساعدة جديد قريب منك',
        body: `${data.problem_type} · ${data.origin_area_label.trim()} ⟶ ${data.destination_area_label.trim()} · ${scheduledLabel}`,
        url: '/',
      }),
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
    return new Response('ok', {
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
      error:
        'بيانات الطلب غير صحيحة أو الموعد يجب أن يكون خلال الـ 48 ساعة القادمة',
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

  const { data: tripId, error: tripError } =
    await serviceClient.rpc('create_trip_from_proxy', {
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
      p_scheduled_at: data.scheduled_at,
      p_problem_type: data.problem_type,
      p_people_count: data.people_count,
      p_request_notes: data.request_notes.trim(),
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

  // Trip already exists at this point — don't let a push failure turn a
  // successful request into an error for the requester.
  await notifyVolunteers(supabaseUrl, supabaseServiceRoleKey, tripId as string, data);

  return response(request, 201, {
    trip_id: tripId,
  });
});🚌 جروب توصيل المدارس -
6 أكتوبر
 (لأولياء الأمور والكباتن)
https://chat.whatsapp.com/DA2ffYWwfQU32vBJAF3fjA?s=cl&p=a&ilr=0
