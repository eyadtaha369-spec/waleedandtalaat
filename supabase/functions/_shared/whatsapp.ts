// Manual-send WhatsApp helper. No gateway/API key needed — this just
// builds a wa.me deep link with the message pre-filled. Clicking it
// opens WhatsApp Web/App with the chat and text ready; a human still
// presses Send. If you later want fully automatic sending, swap
// buildWhatsAppLink() below for a gateway call (UltraMsg/Twilio/Wati).

/** Normalizes a local Egyptian number like "01012345678" to "201012345678". */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
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
