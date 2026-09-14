// Supabase Edge Function: migrate-students-to-phone-login
// Admin-only, one-time bulk operation. Migrates every EXISTING
// student account (not new imports — those already use this scheme)
// to phone-based login with the shared default password, exactly
// like bulk-import-students does for new accounts.
//
// THIS IS DISRUPTIVE AND IRREVERSIBLE: every migrated student's old
// login email and password stop working immediately. They must sign
// in again with their phone number + wt@2027, and will be forced to
// change it before reaching the dashboard (must_change_password=true).
//
// Safely re-runnable: skips any student whose profiles.username
// already equals their normalized phone (already migrated), so if
// this times out partway through a large batch, simply invoking it
// again picks up exactly where it left off — it will never reset an
// already-migrated student's password a second time.
//
// Deploy with: supabase functions deploy migrate-students-to-phone-login
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_PASSWORD = "wt@2027";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Every student, regardless of route/subscription — this is a
    // one-time system-wide migration.
    const { data: students, error: fetchError } = await admin
      .from("profiles")
      .select("id, full_name, phone, username, user_roles:user_roles!inner(role)")
      .eq("user_roles.role", "student");

    if (fetchError) return json({ error: fetchError.message }, 500);

    const results: Array<{
      full_name: string;
      phone: string | null;
      status: "migrated" | "skipped" | "failed";
      error?: string;
    }> = [];

    for (const s of students ?? []) {
      const normalized = s.phone ? normalizePhone(s.phone) : "";
      if (!normalized) {
        results.push({
          full_name: s.full_name,
          phone: s.phone,
          status: "skipped",
          error: "No phone number on file",
        });
        continue;
      }
      if (s.username === normalized) {
        results.push({ full_name: s.full_name, phone: s.phone, status: "skipped" });
        continue;
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(s.id, {
        email: `${normalized}@wt-shuttle.app`,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });

      if (updateError) {
        results.push({
          full_name: s.full_name,
          phone: s.phone,
          status: "failed",
          error: updateError.message,
        });
        continue;
      }

      await admin
        .from("profiles")
        .update({ username: normalized, must_change_password: true })
        .eq("id", s.id);

      results.push({ full_name: s.full_name, phone: s.phone, status: "migrated" });
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
