// Supabase Edge Function: create-student
// POST { full_name, phone, route, subscription_type, photo_url? }
//
// Manual single-student creation (as opposed to bulk-import-students).
// Admin can create on any route; a supervisor can only create a
// student on their own assigned_route.
//
// Same phone-based login + shared default password + forced first-
// change pattern as bulk import: no plaintext password is ever stored
// anywhere for admin viewing — see must_change_password design notes
// in the accompanying migrations.
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

    const body = (await req.json()) as {
      full_name?: string;
      phone?: string;
      route?: string;
      subscription_type?: string;
      payment_status?: string;
      installment_status?: string;
      trips_total?: number;
      photo_url?: string | null;
    };
    const {
      full_name,
      phone,
      route,
      subscription_type,
      payment_status,
      installment_status,
      trips_total,
      photo_url,
    } = body;
    if (!full_name || !phone || !route || !subscription_type || !payment_status) {
      return json(
        { error: "full_name, phone, route, subscription_type and payment_status are required" },
        400,
      );
    }

    if (!isAdmin) {
      // Supervisor: verify staff status and that the target route is
      // their own.
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("assigned_route")
        .eq("id", caller.id)
        .maybeSingle();
      const { data: isStaff } = await admin.rpc("is_staff", { _user_id: caller.id });
      if (!isStaff) return json({ error: "Staff access required" }, 403);
      if (!callerProfile?.assigned_route || callerProfile.assigned_route !== route) {
        return json({ error: "You can only create students on your own route" }, 403);
      }
    }

    const normalized = normalizePhone(phone);
    if (!normalized) return json({ error: "Invalid phone number" }, 400);

    const { data: existing } = await admin
      .from("profiles")
      .select("id, full_name, route")
      .or(`phone.eq.${phone},phone.eq.${normalized}`)
      .maybeSingle();
    if (existing) {
      return json(
        {
          error: `A student with this phone number already exists: ${existing.full_name} (${existing.route ?? "no route"}). Use Edit on that student instead of Add.`,
        },
        400,
      );
    }

    let finalUsername = normalized;
    let attempt = 1;
    while (true) {
      const { data: taken } = await admin
        .from("profiles")
        .select("id")
        .eq("username", finalUsername)
        .maybeSingle();
      if (!taken) break;
      finalUsername = `${normalized}${attempt}`;
      attempt++;
    }

    const email = `${finalUsername}@wt-shuttle.app`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone,
        route,
        photo_url: photo_url ?? null,
        subscription_type,
        payment_status,
        installment_status: installment_status ?? "none",
        trips_total: trips_total ?? 0,
      },
    });

    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Could not create student" }, 400);
    }

    await admin
      .from("profiles")
      .update({ username: finalUsername, must_change_password: true })
      .eq("id", created.user.id);

    return json({ user_id: created.user.id, username: finalUsername, email });
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
