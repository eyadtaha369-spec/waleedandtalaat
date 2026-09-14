// Supabase Edge Function: bulk-import-students
// Creates real auth accounts for a CSV batch of students. Runs with the
// service role key (server-side only) so it can call the Auth admin API,
// which the browser client is never trusted with.
//
// Login is phone-number-based: every new student's email is derived
// from their normalized phone digits, and every new account starts on
// the same default password with must_change_password=true, forcing
// them to set their own on first login. Deliberately does NOT store
// any actual password value anywhere for admin viewing — see the
// must_change_password flag design in the accompanying migration.
//
// Upsert by phone: a row whose phone number already matches an existing
// student profile updates that profile in place instead of creating a
// second account. trips_remaining is deliberately never touched on an
// update — silently refilling it would hand out free trips.
//
// Deploy with: supabase functions deploy bulk-import-students
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_PASSWORD = "wt@2027";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImportRow = {
  full_name: string;
  phone: string;
  route: string;
  pickup_stop?: string;
  photo_url?: string;
  subscription_type: "full_term" | "70_trips" | "weekly" | "top_student_offer";
  payment_status: "paid_full" | "installment_pending";
  installment_status?: "none" | "pending_second" | "completed";
  initial_amount_paid?: number;
  payment_method?: string;
  trips_total: number;
  username: string;
  temp_password: string;
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
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    const { students } = (await req.json()) as { students: ImportRow[] };
    if (!Array.isArray(students) || students.length === 0) {
      return json({ error: "No students provided" }, 400);
    }

    // Build a normalized-phone -> profile lookup once, up front, so
    // every row in the batch is checked against the same snapshot
    // (and against each other's phone numbers if a row is itself a
    // fresh account — handled by refreshing the map after each create).
    const { data: existingProfiles } = await admin.from("profiles").select("id, phone, username");
    const byPhone = new Map<string, { id: string; username: string | null }>();
    const usedUsernames = new Set<string>();
    for (const p of existingProfiles ?? []) {
      if (p.phone) byPhone.set(normalizePhone(p.phone), { id: p.id, username: p.username });
      if (p.username) usedUsernames.add(p.username);
    }

    const results: Array<{
      full_name: string;
      phone: string;
      username: string;
      email: string;
      temp_password: string;
      status: "created" | "updated" | "failed";
      error?: string;
    }> = [];

    for (const row of students) {
      const normalized = normalizePhone(row.phone);
      const existing = normalized ? byPhone.get(normalized) : undefined;

      if (existing) {
        // Update in place — no new auth account, no password change,
        // no login sent out. trips_remaining is intentionally left
        // alone; only trips_total (the plan's stated size) updates.
        const { error: updateError } = await admin
          .from("profiles")
          .update({
            full_name: row.full_name,
            route: row.route,
            pickup_stop: row.pickup_stop ?? null,
            photo_url: row.photo_url ?? null,
            subscription_type: row.subscription_type,
            payment_status: row.payment_status,
            installment_status: row.installment_status ?? "none",
            initial_amount_paid: row.initial_amount_paid ?? null,
            payment_method: row.payment_method ?? null,
            trips_total: row.trips_total,
          })
          .eq("id", existing.id);

        results.push({
          full_name: row.full_name,
          phone: row.phone,
          username: existing.username ?? "",
          email: "",
          temp_password: "",
          status: updateError ? "failed" : "updated",
          error: updateError?.message,
        });
        continue;
      }

      // Login is phone-based: the username portion of the email is
      // the student's own normalized phone number, not a generated
      // name-based one. Collision-safety-net kept for the rare case
      // two rows normalize to the same digits (e.g. a duplicated line).
      let finalUsername = normalized || row.username;
      let attempt = 1;
      while (usedUsernames.has(finalUsername)) {
        finalUsername = `${normalized || row.username}${attempt}`;
        attempt++;
      }
      usedUsernames.add(finalUsername);

      const email = `${finalUsername}@wt-shuttle.app`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: row.full_name,
          phone: row.phone,
          route: row.route,
          pickup_stop: row.pickup_stop ?? null,
          photo_url: row.photo_url ?? null,
          subscription_type: row.subscription_type,
          payment_status: row.payment_status,
          installment_status: row.installment_status ?? "none",
          initial_amount_paid: row.initial_amount_paid ?? null,
          payment_method: row.payment_method ?? null,
          trips_total: row.trips_total,
        },
      });

      if (createError || !created.user) {
        results.push({
          full_name: row.full_name,
          phone: row.phone,
          username: finalUsername,
          email,
          temp_password: DEFAULT_PASSWORD,
          status: "failed",
          error: createError?.message ?? "Unknown error",
        });
        continue;
      }

      // handle_new_user() trigger creates the profile + 'student' role
      // row. Still need to set the username and force a password
      // change on first login — neither is part of that trigger.
      await admin
        .from("profiles")
        .update({ username: finalUsername, must_change_password: true })
        .eq("id", created.user.id);

      // Record this new account so a later row in the same batch with
      // the same phone (e.g. a duplicated line in the sheet) updates
      // it instead of creating yet another account.
      if (normalized) byPhone.set(normalized, { id: created.user.id, username: finalUsername });

      results.push({
        full_name: row.full_name,
        phone: row.phone,
        username: finalUsername,
        email,
        temp_password: DEFAULT_PASSWORD,
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
