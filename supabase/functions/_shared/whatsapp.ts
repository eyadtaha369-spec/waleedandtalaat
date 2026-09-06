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

export function approvalMessage(
  fullName: string,
  route: string,
  slot: string,
  passUrl: string,
): string {
  return (
    `أهلاً ${fullName}! تم تأكيد حجزك اليومي 🚌\n` +
    `الخط: ${route}\n` +
    `📍 رابط QR الذهاب (ميعاد ${slot}): ${passUrl}`
  );
}

export function roundTripApprovalMessage(
  fullName: string,
  morningSlot: string,
  morningPassUrl: string,
  returnSlot: string,
  returnPassUrl: string,
): string {
  return (
    `أهلاً بك! تم تأكيد حجزك اليومي 🚌\n` +
    `📍 رابط QR الذهاب (ميعاد ${morningSlot}): ${morningPassUrl}\n` +
    `📍 رابط QR العودة (ميعاد ${returnSlot}): ${returnPassUrl}`
  );
}

export function rejectionMessage(fullName: string, route: string, slot: string): string {
  return (
    `عذراً ${fullName}، لم نتمكن من تأكيد مقعد على خط ${route} في موعد ${slot} اليوم. ` +
    `برجاء تجربة موعد آخر أو التواصل معنا على الواتساب للمساعدة.`
  );
}
