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
