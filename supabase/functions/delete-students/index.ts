// Supabase Edge Function: delete-students
// POST { user_ids: string[] }
//
// Admin-only. Deletes each given auth user; profiles.id references
// auth.users(id) ON DELETE CASCADE, so the profile (and everything
// keyed off it — bookings, scans, etc.) is removed automatically.
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { user_ids } = (await req.json()) as { user_ids?: string[] };
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return json({ error: "user_ids is required" }, 400);
    }

    const results: Array<{ user_id: string; deleted: boolean; error?: string }> = [];
    for (const id of user_ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      results.push({ user_id: id, deleted: !error, error: error?.message });
    }

    return json({ results });
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
