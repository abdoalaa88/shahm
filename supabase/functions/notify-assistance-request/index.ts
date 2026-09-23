import "npm:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type RequestBody = { assistance_id?: string };

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "Function environment is incomplete" });

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Authentication required" });
  const accessToken = authorization.slice("Bearer ".length).trim();
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json(401, { error: "Invalid authentication token" });

  let input: RequestBody;
  try { input = await request.json(); } catch { return json(400, { error: "Request body must be valid JSON" }); }
  if (!isUuid(input.assistance_id)) return json(422, { error: "A valid assistance_id is required" });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: volunteer, error: volunteerError } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("role", "volunteer")
    .eq("is_active", true)
    .maybeSingle();
  if (volunteerError || !volunteer) return json(403, { error: "Volunteer authorization required" });

  const { data: assistance, error: assistanceError } = await serviceClient
    .from("assistance_requests")
    .select("id, requester_id, issue_type, description, status")
    .eq("id", input.assistance_id)
    .maybeSingle();
  if (assistanceError || !assistance || assistance.requester_id !== volunteer.id || assistance.status !== "pending") {
    return json(403, { error: "Assistance authorization failed" });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        assistance_id: assistance.id,
        payload: {
          title: "طلب عون قريب منك",
          body: "في شهم محتاج عون على الطريق.",
          url: "/",
          icon: "/icons/icon-192.png",
        },
      }),
    });
    return json(response.ok ? 202 : 502, { dispatched: response.ok });
  } catch (error) {
    console.error("Assistance push request failed", { message: error instanceof Error ? error.message : "unknown error" });
    return json(202, { dispatched: false });
  }
});
