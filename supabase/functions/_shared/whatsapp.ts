// Shared WhatsApp send helper. Written as plain async functions using
// fetch, so this file works unchanged in a Deno Edge Function or in a
// Node.js backend (Next.js API route, Express, etc.) — just swap the
// import for `process.env` instead of `Deno.env.get` if you move it.
//
// Default implementation targets UltraMsg (https://ultramsg.com), which
// exposes a single REST endpoint per WhatsApp instance. Swapping to
// Twilio or Wati only means changing buildUrl()/buildBody() below —
// the calling code (sendWhatsApp) stays the same.

export type WhatsAppSendResult = { ok: boolean; error?: string };

const ULTRAMSG_INSTANCE_ID = Deno.env.get("ULTRAMSG_INSTANCE_ID") ?? "";
const ULTRAMSG_TOKEN = Deno.env.get("ULTRAMSG_TOKEN") ?? "";

/** Normalizes a local Egyptian number like "01012345678" to "201012345678". */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

export async function sendWhatsApp(phone: string, message: string): Promise<WhatsAppSendResult> {
  if (!ULTRAMSG_INSTANCE_ID || !ULTRAMSG_TOKEN) {
    console.error("WhatsApp gateway not configured (ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN missing)");
    return { ok: false, error: "WhatsApp gateway not configured" };
  }

  const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
  const body = new URLSearchParams({
    token: ULTRAMSG_TOKEN,
    to: toWhatsAppNumber(phone),
    body: message,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("WhatsApp send failed", res.status, text);
      return { ok: false, error: `Gateway returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("WhatsApp send error", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function approvalMessage(fullName: string, route: string, slot: string, passUrl: string): string {
  return (
    `Hi ${fullName}! Your Waleed & Talaat daily pass is confirmed ✅\n` +
    `Route: ${route}\nTime: ${slot}\n\n` +
    `Show this pass to the supervisor when boarding:\n${passUrl}`
  );
}

export function rejectionMessage(fullName: string, route: string, slot: string): string {
  return (
    `Hi ${fullName}, unfortunately we couldn't confirm a seat for ${route} at ${slot} today. ` +
    `Please try requesting another time slot, or contact us on WhatsApp for help.`
  );
}
