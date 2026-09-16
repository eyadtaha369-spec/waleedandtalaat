// Supabase Edge Function: scan-pass
// POST { boarding_token, slot } for a subscriber, or { guest_token } for a
// daily-pass guest -> { status: "booked" | "not_booked" | "scanned_earlier", ... }
// Thin, auth-forwarding wrapper around the scan_pass() / scan_guest_pass()
// Postgres RPCs, which do the real work atomically in one transaction.
//
// boarding_token (not a raw student_id) is a short-lived, single-use
// token the student's own pass page generates and rotates every ~45s
// (see generate_boarding_token()) — scan_pass() looks up the student
// from it and rejects an expired/already-used one server-side.
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

    const { boarding_token, slot, guest_token, exam_token, service_date } = (await req.json()) as {
      boarding_token?: string;
      slot?: string;
      guest_token?: string;
      exam_token?: string;
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

    if (exam_token) {
      const { data, error } = await client.rpc("scan_exam_pass", { p_token: exam_token });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (!boarding_token || !slot) {
      return json(
        { error: "boarding_token and slot (or guest_token/exam_token) are required" },
        400,
      );
    }

    const { data, error } = await client.rpc("scan_pass", {
      p_token: boarding_token,
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
