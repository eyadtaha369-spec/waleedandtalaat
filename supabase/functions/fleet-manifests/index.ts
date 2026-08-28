// Supabase Edge Function: fleet-manifests
// GET/POST { date?: "YYYY-MM-DD" } -> per-route bus sizing recommendation
// Corresponds to spec endpoint /api/admin/fleet-manifests.
// Thin wrapper around fleet_manifest_report(), which is admin-gated
// (checks is_admin(auth.uid())) and does the actual math server-side.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let date: string | undefined;
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { date?: string };
      date = body.date;
    } else {
      date = new URL(req.url).searchParams.get("date") ?? undefined;
    }

    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data, error } = await client.rpc("fleet_manifest_report", { p_date: date ?? null });
    if (error) return json({ error: error.message }, 400);
    return json({ routes: data });
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
