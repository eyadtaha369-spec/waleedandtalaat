// Supabase Edge Function: bulk-import-students
// Creates real auth accounts for a CSV batch of students. Runs with the
// service role key (server-side only) so it can call the Auth admin API,
// which the browser client is never trusted with.
//
// Deploy with: supabase functions deploy bulk-import-students
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImportRow = {
  full_name: string;
  phone: string;
  route: string;
  pickup_stop?: string;
  subscription_type: "full_term" | "package";
  trips_total: number;
  username: string;
  temp_password: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is a signed-in staff member (admin/supervisor).
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) {
      return json({ error: "Not authenticated" }, 401);
    }
    const admin = createClient(url, serviceKey);
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
    if (!isStaff) {
      return json({ error: "Staff access required" }, 403);
    }

    const { students } = (await req.json()) as { students: ImportRow[] };
    if (!Array.isArray(students) || students.length === 0) {
      return json({ error: "No students provided" }, 400);
    }

    const results: Array<{
      full_name: string;
      username: string;
      email: string;
      temp_password: string;
      status: "created" | "failed";
      error?: string;
    }> = [];

    for (const row of students) {
      const email = `${row.username}@wt-shuttle.app`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: row.temp_password,
        email_confirm: true,
        user_metadata: {
          full_name: row.full_name,
          phone: row.phone,
          route: row.route,
          pickup_stop: row.pickup_stop ?? null,
          subscription_type: row.subscription_type,
          trips_total: row.trips_total,
        },
      });

      if (createError || !created.user) {
        results.push({
          full_name: row.full_name,
          username: row.username,
          email,
          temp_password: row.temp_password,
          status: "failed",
          error: createError?.message ?? "Unknown error",
        });
        continue;
      }

      // handle_new_user() trigger creates the profile + 'student' role row.
      // We still need to store the chosen username since signup metadata
      // doesn't include it.
      await admin.from("profiles").update({ username: row.username }).eq("id", created.user.id);

      results.push({
        full_name: row.full_name,
        username: row.username,
        email,
        temp_password: row.temp_password,
        status: "created",
      });
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
