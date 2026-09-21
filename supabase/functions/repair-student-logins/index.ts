// Supabase Edge Function: repair-student-logins
// Admin-only. Finds every student whose username doesn't match what
// their CURRENT phone number should normalize to — the signature of
// having had their phone edited (via update-student, before that bug
// was fixed) without the Auth login email being kept in sync — and
// repairs them: recomputes a safe username, updates the Auth email to
// match, and updates profiles.username.
//
// Safely re-runnable: only touches students where username actually
// differs from normalizePhone(phone), so running it again after a
// partial failure or timeout just picks up whatever's still wrong.
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

    const students: {
      user_id: string;
      full_name: string;
      phone: string | null;
      username: string | null;
    }[] = [];
    {
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data: page, error: fetchError } = await admin
          .rpc("list_all_students_for_migration")
          .range(from, from + pageSize - 1);
        if (fetchError) return json({ error: fetchError.message }, 500);
        students.push(...(page ?? []));
        if (!page || page.length < pageSize) break;
        from += pageSize;
      }
    }

    const results: Array<{
      full_name: string;
      phone: string | null;
      status: "repaired" | "skipped" | "failed";
      error?: string;
    }> = [];

    for (const s of students) {
      const normalized = s.phone ? normalizePhone(s.phone) : "";
      if (!normalized) {
        results.push({ full_name: s.full_name, phone: s.phone, status: "skipped" });
        continue;
      }
      if (s.username === normalized) {
        results.push({ full_name: s.full_name, phone: s.phone, status: "skipped" });
        continue;
      }

      let finalUsername = normalized;
      let attempt = 1;
      while (true) {
        const { data: taken } = await admin
          .from("profiles")
          .select("id")
          .eq("username", finalUsername)
          .neq("id", s.user_id)
          .maybeSingle();
        if (!taken) break;
        finalUsername = `${normalized}${attempt}`;
        attempt++;
      }

      const { error: emailError } = await admin.auth.admin.updateUserById(s.user_id, {
        email: `${finalUsername}@wt-shuttle.app`,
        email_confirm: true,
      });
      if (emailError) {
        results.push({
          full_name: s.full_name,
          phone: s.phone,
          status: "failed",
          error: emailError.message,
        });
        continue;
      }

      await admin.from("profiles").update({ username: finalUsername }).eq("id", s.user_id);
      results.push({ full_name: s.full_name, phone: s.phone, status: "repaired" });
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
