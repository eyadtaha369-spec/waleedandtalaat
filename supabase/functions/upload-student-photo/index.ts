// Supabase Edge Function: upload-student-photo
// POST { student_id, file_base64, file_name, content_type }
//
// The avatars bucket's own RLS only lets a user write to their own
// {uid}/... folder, which blocks staff uploading a photo on behalf of
// a student who isn't the caller. This uses the service role to
// upload directly instead, scoped to the target student's own folder
// — same trust boundary as every other staff-only bulk operation in
// this app, just via the storage API rather than a table write.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 5 * 1024 * 1024;

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
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: caller.id });
    if (!isStaff) return json({ error: "Staff access required" }, 403);

    const { student_id, file_base64, file_name, content_type } = (await req.json()) as {
      student_id?: string;
      file_base64?: string;
      file_name?: string;
      content_type?: string;
    };
    if (!student_id || !file_base64 || !file_name) {
      return json({ error: "student_id, file_base64 and file_name are required" }, 400);
    }

    // If the caller isn't admin, restrict to their own route's students.
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) {
      const { data: target } = await admin
        .from("profiles")
        .select("route")
        .eq("id", student_id)
        .maybeSingle();
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("assigned_route")
        .eq("id", caller.id)
        .maybeSingle();
      if (
        !target ||
        !callerProfile?.assigned_route ||
        target.route !== callerProfile.assigned_route
      ) {
        return json({ error: "You can only upload photos for students on your own route" }, 403);
      }
    }

    const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) {
      return json({ error: "Image too large (max 5MB)" }, 400);
    }

    const ext = file_name.split(".").pop() ?? "jpg";
    const path = `${student_id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, bytes, { contentType: content_type ?? "image/jpeg", upsert: true });
    if (uploadError) return json({ error: uploadError.message }, 400);

    const { data: publicUrl } = admin.storage.from("avatars").getPublicUrl(path);
    return json({ photo_url: publicUrl.publicUrl });
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
