export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

export function groupInviteMessage(fullName: string, routeName: string, groupLink: string): string {
  return (
    `أهلاً بك يا ${fullName} 👋\n` +
    `للانضمام إلى جروب الواتساب الخاص بخطك (${routeName}) لمتابعة تحركات الأتوبيسات والمواعيد، ` +
    `اضغط على الرابط التالي:\n${groupLink}`
  );
}

export function groupInviteLink(
  fullName: string,
  phone: string,
  routeName: string,
  groupLink: string,
): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(
    groupInviteMessage(fullName, routeName, groupLink),
  )}`;
}

/**
 * Opens the invite link and reports whether it actually opened.
 * window.open() returns null when a popup blocker intercepts it —
 * callers must check this before recording the invite as sent, or a
 * blocked popup gets silently recorded as delivered.
 *
 * Only checks for a non-null return, not win.closed: checking
 * .closed synchronously right after opening a cross-origin URL
 * (wa.me) is timing-sensitive and can report a false negative even
 * when the tab genuinely opened — that's exactly what was happening
 * here (WhatsApp visibly opened, but this check still said it hadn't).
 */
export function openGroupInvite(
  fullName: string,
  phone: string,
  routeName: string,
  groupLink: string,
): boolean {
  // No "noopener" here on purpose: with it, window.open() returns
  // null even on success in most browsers, which would make this
  // success check meaningless. wa.me is a fixed, trusted domain, so
  // the usual reverse-tabnabbing risk noopener guards against
  // doesn't apply.
  const win = window.open(groupInviteLink(fullName, phone, routeName, groupLink), "_blank");
  return !!win;
}
