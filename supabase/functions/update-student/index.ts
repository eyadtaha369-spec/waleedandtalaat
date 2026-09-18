// Supabase Edge Function: update-student
// POST { student_id, full_name?, phone?, route?, photo_url?, subscription_type?, payment_status?, installment_status?, trips_total? }
//
// Edits an existing student's profile fields. Admin can edit any
// student; a supervisor can only edit a student currently on their
// own assigned_route.
import { createClient } from "jsr:@supabase/supabase-js@2";

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
      student_id?: string;
      full_name?: string;
      phone?: string;
      route?: string;
      photo_url?: string | null;
      subscription_type?: string;
      payment_status?: string;
      installment_status?: string;
      trips_total?: number;
    };
    const { student_id, ...fields } = body;
    if (!student_id) return json({ error: "student_id is required" }, 400);

    const { data: target } = await admin
      .from("profiles")
      .select("route")
      .eq("id", student_id)
      .maybeSingle();
    if (!target) return json({ error: "Student not found" }, 404);

    if (!isAdmin) {
      const { data: isStaff } = await admin.rpc("is_staff", { _user_id: caller.id });
      if (!isStaff) return json({ error: "Staff access required" }, 403);
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("assigned_route")
        .eq("id", caller.id)
        .maybeSingle();
      if (!callerProfile?.assigned_route || callerProfile.assigned_route !== target.route) {
        return json({ error: "You can only edit students on your own route" }, 403);
      }
      // A supervisor may only move a student to their OWN route, not
      // off it to some other line.
      if (fields.route && fields.route !== callerProfile.assigned_route) {
        return json({ error: "You can only assign students to your own route" }, 403);
      }
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (Object.keys(update).length === 0) {
      return json({ error: "No fields to update" }, 400);
    }

    // A student's login email is derived from their phone number
    // ({digits}@wt-shuttle.app) — editing phone here without also
    // updating the Auth email leaves them unable to log in with
    // their corrected number, even though their profile is right.
    // This is the actual root cause of "Invalid login credentials"
    // for a student whose phone was ever edited through this form.
    if (fields.phone) {
      const normalized = normalizePhone(fields.phone);
      if (!normalized) return json({ error: "Invalid phone number" }, 400);

      let finalUsername = normalized;
      let attempt = 1;
      while (true) {
        const { data: taken } = await admin
          .from("profiles")
          .select("id")
          .eq("username", finalUsername)
          .neq("id", student_id)
          .maybeSingle();
        if (!taken) break;
        finalUsername = `${normalized}${attempt}`;
        attempt++;
      }

      const { error: emailError } = await admin.auth.admin.updateUserById(student_id, {
        email: `${finalUsername}@wt-shuttle.app`,
        email_confirm: true,
      });
      if (emailError) return json({ error: emailError.message }, 400);

      update.username = finalUsername;
    }

    const { error: updateError } = await admin.from("profiles").update(update).eq("id", student_id);
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ student_id });
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
