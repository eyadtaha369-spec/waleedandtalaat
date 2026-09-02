// Supabase Edge Function: scan-pass
// POST { student_id, slot } for a subscriber, or { guest_token } for a
// daily-pass guest -> { status: "booked" | "not_booked" | "scanned_earlier", ... }
// Thin, auth-forwarding wrapper around the scan_pass() / scan_guest_pass()
// Postgres RPCs, which do the real work atomically in one transaction.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { student_id, slot, guest_token, service_date } = (await req.json()) as {
      student_id?: string;
      slot?: string;
      guest_token?: string;
      service_date?: string;
    };

    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    if (guest_token) {
      const { data, error } = await client.rpc("scan_guest_pass", { p_token: guest_token });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (!student_id || !slot) {
      return json({ error: "student_id and slot (or guest_token) are required" }, 400);
    }

    const { data, error } = await client.rpc("scan_pass", {
      p_student_id: student_id,
      p_slot: slot,
      p_service_date: service_date ?? null,
    });
    if (error) return json({ error: error.message }, 400);
    return json(data);
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
