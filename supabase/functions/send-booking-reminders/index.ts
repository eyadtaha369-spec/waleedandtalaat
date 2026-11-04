// Sends the hourly "booking is open" Web Push reminders.
// Invoked by pg_cron (job `booking-reminders`, every 30 min) with the header
// x-cron-secret. The function itself decides, in Cairo time, whether the
// current tick is a send slot, so it is DST-proof and idempotent
// (push_reminder_runs.run_key).
//
// Windows (Cairo time), matching src/lib/schedule.ts:
//   dep: booking for TOMORROW's morning trip, open 12:00–19:00
//        -> pushes at 12:00, 13:00 … 18:00
//   ret: booking for TODAY's early return, open 06:30–10:30
//        -> pushes at 06:30, 07:30, 08:30, 09:30
// Skips students who already booked that trip, windows an admin
// FORCE_CLOSED, and non-service days (service runs Sun–Thu).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const TZ = "Africa/Cairo";
const APP_URL = "https://waleedandtalaat.vercel.app/dashboard";
const SERVICE_DOW = new Set([0, 1, 2, 3, 4]); // Sun..Thu
const DEP_SLOTS = [720, 780, 840, 900, 960, 1020, 1080]; // minutes of day
const RET_SLOTS = [390, 450, 510, 570];
const TOLERANCE_MIN = 10;

type Win = "dep" | "ret";

function cairoParts(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${g("year")}-${g("month")}-${g("day")}`,
    minutes: (Number(g("hour")) % 24) * 60 + Number(g("minute")),
    dow: dowMap[g("weekday")],
  };
}

function addDays(dateKey: string, n: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: cfgRows, error: cfgErr } = await admin.from("push_config").select("key,value");
  if (cfgErr) return json({ error: "config unavailable" }, 500);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));

  if (!cfg.cron_secret || req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    return json({ error: "unauthorized" }, 401);
  }

  // Optional body for manual tests: { window: "dep"|"ret", dry_run?: true, user_id?: uuid }
  let body: { window?: Win; dry_run?: boolean; user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body from cron */
  }

  const now = cairoParts();
  let win: Win | null = null;
  let slot = 0;
  if (body.window === "dep" || body.window === "ret") {
    win = body.window;
    slot = now.minutes;
  } else {
    for (const s of DEP_SLOTS) if (Math.abs(now.minutes - s) <= TOLERANCE_MIN) { win = "dep"; slot = s; }
    for (const s of RET_SLOTS) if (Math.abs(now.minutes - s) <= TOLERANCE_MIN) { win = "ret"; slot = s; }
  }
  if (!win) return json({ skipped: "not a send slot", cairo: now });

  const serviceDate = win === "dep" ? addDays(now.date, 1) : now.date;
  const serviceDow = win === "dep" ? (now.dow + 1) % 7 : now.dow;
  const manual = Boolean(body.window);
  if (!manual && !SERVICE_DOW.has(serviceDow)) return json({ skipped: "no service that day", serviceDate });

  const { data: settings } = await admin
    .from("app_settings")
    .select("morning_departure_status,early_return_status")
    .limit(1)
    .maybeSingle();
  const status = win === "dep" ? settings?.morning_departure_status : settings?.early_return_status;
  if (!manual && status === "FORCE_CLOSED") return json({ skipped: "window force-closed" });

  const runKey = `${win}|${serviceDate}|${slot}`;
  if (!manual) {
    const { error: dupErr } = await admin.from("push_reminder_runs").insert({ run_key: runKey });
    if (dupErr) return json({ skipped: "already sent", runKey });
  }

  // Students who already booked this trip don't need the nag.
  const kind = win === "dep" ? "morning" : "return";
  const booked = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("bookings")
      .select("student_id")
      .eq("service_date", serviceDate)
      .eq("kind", kind)
      .range(from, from + 999);
    for (const r of data ?? []) booked.add(r.student_id);
    if (!data || data.length < 1000) break;
  }
  const students = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("user_roles").select("user_id").eq("role", "student").range(from, from + 999);
    for (const r of data ?? []) students.add(r.user_id);
    if (!data || data.length < 1000) break;
  }

  const targets: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").range(from, from + 999);
    if (body.user_id) q = q.eq("user_id", body.user_id);
    const { data } = await q;
    for (const s of data ?? []) {
      if (!body.user_id && (!students.has(s.user_id) || booked.has(s.user_id))) continue;
      targets.push(s);
    }
    if (!data || data.length < 1000) break;
  }

  if (body.dry_run) return json({ dry_run: true, window: win, serviceDate, recipients: targets.length, booked: booked.size });

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const label = win === "dep" ? "الذهاب" : "العودة";
  const payload = JSON.stringify({
    title: "🚌 الحجز مفتوح الآن!",
    body: `يا بطل متنساش تحجز مكانك في باص ${label}، ادخل احجز دلوقتي قبل ما العدد يكمل!`,
    url: APP_URL,
    tag: `booking-${win}`,
  });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const CONCURRENCY = 25;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(
      targets.slice(i, i + CONCURRENCY).map(async (t) => {
        try {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
            payload,
            { TTL: 1800, urgency: "high" },
          );
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(t.id);
          failed++;
        }
      }),
    );
  }
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  if (!manual) {
    await admin.from("push_reminder_runs").update({ sent, failed, removed: dead.length }).eq("run_key", runKey);
  }
  return json({ window: win, serviceDate, sent, failed, removed: dead.length });
});
