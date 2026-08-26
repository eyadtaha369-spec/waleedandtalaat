// Supabase Edge Function: admin-daily-pass-action
// POST { request_id, action: "approved" | "rejected" }
//
// Corresponds to spec endpoint /api/admin/daily-pass/action.
// - Calls decide_daily_pass_request() RPC (staff-gated, does the DB work)
// - On approval: builds the public QR pass URL and sends a WhatsApp
//   confirmation with the link
// - On rejection: sends a polite WhatsApp rejection notice
import { createClient } from "jsr:@supabase/supabase-js@2";
import { approvalMessage, rejectionMessage, sendWhatsApp } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public site origin used to build the shareable pass URL.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://waleedandtalaat.vercel.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { request_id, action } = (await req.json()) as {
      request_id?: string;
      action?: "approved" | "rejected";
    };
    if (!request_id || !action) return json({ error: "request_id and action are required" }, 400);

    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data, error } = await client.rpc("decide_daily_pass_request", {
      p_request_id: request_id,
      p_action: action,
    });
    if (error) return json({ error: error.message }, 400);
    if (data?.error) return json(data, 404);

    let whatsapp: { ok: boolean; error?: string } = { ok: false };
    if (action === "approved") {
      const passUrl = `${SITE_URL}/guest-pass/${data.pass_token}`;
      whatsapp = await sendWhatsApp(
        data.phone,
        approvalMessage(data.full_name, data.route, data.slot, passUrl),
      );
    } else {
      whatsapp = await sendWhatsApp(data.phone, rejectionMessage(data.full_name, data.route, data.slot));
    }

    return json({ ...data, whatsapp_sent: whatsapp.ok, whatsapp_error: whatsapp.error });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
