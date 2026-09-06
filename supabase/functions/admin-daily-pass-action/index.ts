// Supabase Edge Function: admin-daily-pass-action
// POST { request_id, action: "approved" | "rejected" }
//
// Corresponds to spec endpoint /api/admin/daily-pass/action.
// - Calls decide_daily_pass_request() RPC (staff-gated, does the DB work)
// - Builds a wa.me link with the confirmation/rejection message
//   pre-filled. Sending is manual: the admin clicks the link, WhatsApp
//   opens with the chat and text ready, and they press Send themselves.
//
// Self-contained on purpose: the Supabase dashboard's single-file
// "Via Editor" deploy doesn't bundle a separate _shared/ folder, so
// the WhatsApp helpers below are inlined rather than imported.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public site origin used to build the shareable pass URL.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://waleedandtalaat.vercel.app";

/** Normalizes a local Egyptian number like "01012345678" to "201012345678". */
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

function approvalMessage(fullName: string, route: string, slot: string, passUrl: string): string {
  return (
    `أهلاً ${fullName}! تم تأكيد حجزك اليومي 🚌\n` +
    `الخط: ${route}\n` +
    `📍 رابط QR الذهاب (ميعاد ${slot}): ${passUrl}`
  );
}

function roundTripApprovalMessage(
  fullName: string,
  morningSlot: string,
  morningPassUrl: string,
  returnSlot: string,
  returnPassUrl: string,
): string {
  return (
    `أهلاً بك! تم تأكيد حجزك اليومي 🚌\n` +
    `📍 رابط QR الذهاب (ميعاد ${morningSlot}): ${morningPassUrl}\n` +
    `📍 رابط QR العودة (ميعاد ${returnSlot}): ${returnPassUrl}`
  );
}

function rejectionMessage(fullName: string, route: string, slot: string): string {
  return (
    `عذراً ${fullName}، لم نتمكن من تأكيد مقعد على خط ${route} في موعد ${slot} اليوم. ` +
    `برجاء تجربة موعد آخر أو التواصل معنا على الواتساب للمساعدة.`
  );
}

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

    const message =
      action === "approved"
        ? data.trip_type === "round_trip" && data.return_pass_token
          ? roundTripApprovalMessage(
              data.full_name,
              data.morning_slot,
              `${SITE_URL}/guest-pass/${data.morning_pass_token}`,
              data.return_slot,
              `${SITE_URL}/guest-pass/${data.return_pass_token}`,
            )
          : approvalMessage(
              data.full_name,
              data.route,
              data.morning_slot,
              `${SITE_URL}/guest-pass/${data.morning_pass_token}`,
            )
        : rejectionMessage(data.full_name, data.route, data.morning_slot);

    return json({ ...data, whatsapp_url: buildWhatsAppLink(data.phone, message) });
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
