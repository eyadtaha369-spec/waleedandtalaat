// Supabase Edge Function: manage-staff
// POST { action: "create" | "reset_password" | "set_active", ... }
//
// Handles the staff-account operations that need the Auth Admin API
// (creating a user, setting a password, banning/unbanning) — none of
// which can be done from a plain SQL RPC. Every action re-checks the
// caller is an admin before touching anything.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateBody = {
  action: "create";
  full_name: string;
  phone: string;
  email: string;
  password: string;
  role: "admin" | "supervisor";
  assigned_route?: string | null;
};
type ResetPasswordBody = { action: "reset_password"; user_id: string; new_password: string };
type SetActiveBody = { action: "set_active"; user_id: string; active: boolean };
type Body = CreateBody | ResetPasswordBody | SetActiveBody;

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

    const body = (await req.json()) as Body;

    if (body.action === "create") {
      const { full_name, phone, email, password, role, assigned_route } = body;
      if (!full_name || !email || !password || !role) {
        return json({ error: "full_name, email, password and role are required" }, 400);
      }
      if (role === "supervisor" && !assigned_route) {
        return json({ error: "assigned_route is required for supervisors" }, 400);
      }
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, phone },
      });
      if (createError || !created.user) {
        return json({ error: createError?.message ?? "Could not create user" }, 400);
      }
      // handle_new_user() trigger auto-assigns 'student' — swap it for
      // the requested staff role.
      await admin.from("user_roles").delete().eq("user_id", created.user.id).eq("role", "student");
      await admin.from("user_roles").insert({ user_id: created.user.id, role });
      if (role === "supervisor") {
        await admin.from("profiles").update({ assigned_route }).eq("id", created.user.id);
      }
      return json({ user_id: created.user.id, full_name, phone, email, role, assigned_route });
    }

    if (body.action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password)
        return json({ error: "user_id and new_password are required" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) return json({ error: error.message }, 400);
      return json({ user_id, reset: true });
    }

    if (body.action === "set_active") {
      const { user_id, active } = body;
      if (!user_id || typeof active !== "boolean") {
        return json({ error: "user_id and active are required" }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: active ? "none" : "876000h",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ user_id, active });
    }

    return json({ error: "Unknown action" }, 400);
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
