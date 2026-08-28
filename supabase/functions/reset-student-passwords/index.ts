// Supabase Edge Function: reset-student-passwords
// POST { students: [{ user_id, new_password }] } -> per-account results
//
// For recovering credentials on accounts that were created before
// their login details were ever sent out. The original temp password
// can't be recovered (it's hashed), so this sets a fresh one per
// account via the Auth Admin API and hands back the new value.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ResetRow = { user_id: string; new_password: string };

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
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { students } = (await req.json()) as { students: ResetRow[] };
    if (!Array.isArray(students) || students.length === 0) {
      return json({ error: "No students provided" }, 400);
    }

    const results: Array<{ user_id: string; status: "reset" | "failed"; error?: string }> = [];

    for (const row of students) {
      const { error } = await admin.auth.admin.updateUserById(row.user_id, {
        password: row.new_password,
      });
      results.push(
        error
          ? { user_id: row.user_id, status: "failed", error: error.message }
          : { user_id: row.user_id, status: "reset" },
      );
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
