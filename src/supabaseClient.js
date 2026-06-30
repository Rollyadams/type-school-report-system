import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-user-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ valid: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { code?: string; billing?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ valid: false, error: "Invalid request body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const code = (body.code || "").toString().trim().toUpperCase();
  const billing = (body.billing || "").toString().trim();

  if (!code) {
    return new Response(JSON.stringify({ valid: false, error: "No code provided" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { data: promo, error: fetchError } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .single();

  if (fetchError || !promo) {
    return new Response(JSON.stringify({ valid: false, error: "Invalid or expired promo code." }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (promo.billing_cycle !== billing) {
    return new Response(
      JSON.stringify({ valid: false, error: `This code is only valid for the ${promo.billing_cycle} plan.` }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (new Date(promo.valid_until) < new Date()) {
    return new Response(JSON.stringify({ valid: false, error: "This promo code has expired." }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (promo.times_used >= promo.max_uses) {
    return new Response(JSON.stringify({ valid: false, error: "This promo code has already been fully redeemed." }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ valid: true, code: promo.code, discount: promo.discount }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});