import "npm:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type NotifyRequest = {
  assistance_id?: string;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(204, {});
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase function environment is incomplete" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Authentication required" });
  const accessToken = authorization.slice("Bearer ".length).trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json(401, { error: "Invalid authentication token" });

  let input: NotifyRequest;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }
  if (!isUuid(input.assistance_id)) return json(422, { error: "A valid assistance_id is required" });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: helper, error: helperError } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("role", "volunteer")
    .eq("is_active", true)
    .maybeSingle();
  if (helperError || !helper) return json(403, { error: "Volunteer authorization required" });

  const { data: assistance, error: assistanceError } = await serviceClient
    .from("assistance_requests")
    .select("requester_id, helper_id, status")
    .eq("id", input.assistance_id)
    .maybeSingle();
  if (assistanceError) {
    console.error("Could not load accepted assistance request", { code: assistanceError.code });
    return json(500, { error: "Could not load assistance request" });
  }
  if (!assistance || assistance.status !== "accepted" || assistance.helper_id !== helper.id) {
    return json(403, { error: "Assistance acceptance authorization failed" });
  }

  const { error: claimError } = await serviceClient
    .from("assistance_accept_notifications")
    .insert({ assistance_id: input.assistance_id });
  if (claimError?.code === "23505") return json(200, { claimed: false, dispatched: false });
  if (claimError) {
    console.error("Could not claim assistance acceptance notification", { code: claimError.code });
    return json(500, { error: "Could not claim notification" });
  }

  const sendUrl = `${supabaseUrl}/functions/v1/send-push`;
  let dispatched = false;
  try {
    const sendResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: assistance.requester_id,
        payload: {
          title: "شهم قبل طلب العون",
          body: "في شهم في طريقه يساعدك دلوقتي.",
          url: "/",
          icon: "/icons/icon-192.png",
        },
      }),
    });
    dispatched = sendResponse.ok;
    if (!dispatched) console.error("Assistance acceptance push request failed", { status: sendResponse.status });
  } catch (error) {
    console.error("Assistance acceptance push request could not be sent", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }

  return json(202, { claimed: true, dispatched });
});
