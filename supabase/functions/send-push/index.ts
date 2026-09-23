import "npm:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon: string;
};

type SendPushRequest = {
  trip_id?: string;
  user_id?: string;
  payload?: Partial<PushPayload>;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isTrustedCaller = (request: Request) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization");
  return Boolean(serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`);
};

const defaultPayload = (payload: Partial<PushPayload> | undefined): PushPayload => ({
  title: payload?.title || "شَهْم",
  body: payload?.body || "لديك إشعار جديد من منصة شَهْم",
  url: payload?.url || "/",
  icon: payload?.icon || "/icons/icon-192.png",
});

const sendToUsers = async (
  serviceClient: ReturnType<typeof getServiceClient>,
  userIds: string[],
  payload: PushPayload,
) => {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return { attempted: 0, sent: 0, stale: 0 };

  const { data: subscriptions, error } = await serviceClient
    .from("push_subscriptions")
    .select("user_id, subscription")
    .in("user_id", uniqueUserIds);
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);

  let sent = 0;
  let stale = 0;
  for (const row of subscriptions ?? []) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await serviceClient
          .from("push_subscriptions")
          .delete()
          .eq("user_id", row.user_id);
        if (deleteError) {
          console.error("Could not remove stale push subscription", {
            userId: row.user_id,
            code: deleteError.code,
          });
        } else {
          stale += 1;
        }
      } else {
        console.error("Push delivery failed", {
          userId: row.user_id,
          statusCode,
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  }

  return { attempted: subscriptions?.length ?? 0, sent, stale };
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!isTrustedCaller(request)) return json(401, { error: "Internal caller required" });

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@shahm.app";
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID configuration is incomplete");
    return json(500, { error: "Push service is not configured" });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let input: SendPushRequest;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  if ((input.trip_id && input.user_id) || (!input.trip_id && !input.user_id)) {
    return json(422, { error: "Exactly one target is required" });
  }
  if ((input.trip_id && !isUuid(input.trip_id)) || (input.user_id && !isUuid(input.user_id))) {
    return json(422, { error: "Invalid target" });
  }

  try {
    const serviceClient = getServiceClient();
    let userIds: string[];
    const payload = defaultPayload(input.payload);

    if (input.trip_id) {
      const { data, error } = await serviceClient.rpc("get_nearby_volunteer_ids", {
        p_trip_id: input.trip_id,
        p_radius_km: 20,
        p_max_age_minutes: 180,
      });
      if (error) throw new Error(`Could not find nearby volunteers: ${error.message}`);
      userIds = (data ?? []).map((row: { user_id: string }) => row.user_id);
    } else {
      userIds = [input.user_id as string];
    }

    const result = await sendToUsers(serviceClient, userIds, payload);
    console.log("Push dispatch completed", { targetCount: userIds.length, ...result });
    return json(200, result);
  } catch (error) {
    console.error("Push dispatch failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return json(500, { error: "Push dispatch failed" });
  }
});
