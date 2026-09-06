/**
 * Temporary "Exam Days / Summer Bookings" system for non-subscribers.
 * Fixed exam dates and a fixed stop/time list, independent of the
 * regular routes/stops hierarchy.
 */

export const EXAM_DATES = [
  { value: "2026-09-07", label: "الاثنين 7 سبتمبر" },
  { value: "2026-09-08", label: "الثلاثاء 8 سبتمبر" },
  { value: "2026-09-09", label: "الأربعاء 9 سبتمبر" },
  { value: "2026-09-10", label: "الخميس 10 سبتمبر" },
  { value: "2026-09-14", label: "الاثنين 14 سبتمبر" },
] as const;

export function examDateLabel(value: string): string {
  return EXAM_DATES.find((d) => d.value === value)?.label ?? value;
}

export const EXAM_STOPS: { name: string; time: string }[] = [
  { name: "المنتدره عند الشيراتون", time: "6:00 AM" },
  { name: "إشارة الوردة البيضاء", time: "6:05 AM" },
  { name: "نفق 45", time: "6:05 AM" },
  { name: "نفق الاسكندر ابراهيم", time: "6:10 AM" },
  { name: "إشارة خليل حماده", time: "6:12 AM" },
  { name: "العزيزية", time: "6:12 AM" },
  { name: "إشارة جامع سيدي بشر", time: "6:15 AM" },
  { name: "إشارة محمد نجيب", time: "6:20 AM" },
  { name: "نفق المحروسه", time: "6:25 AM" },
  { name: "إشارة الاقبال", time: "6:25 AM" },
  { name: "اشاره 26 يوليو", time: "6:25 AM" },
  { name: "إشارة سان ستيفانو", time: "6:30 AM" },
  { name: "نفق جليم", time: "6:35 AM" },
  { name: "نفق سابا باشا", time: "6:35 AM" },
  { name: "اشاره كوبري استانلي", time: "6:38 AM" },
  { name: "اشاره اخر كوبري ستانلي", time: "6:40 AM" },
  { name: "إشارة The Walk", time: "6:41 AM" },
  { name: "نفق كليوباترا", time: "6:42 AM" },
  { name: "نفق سبورتنج", time: "6:43 AM" },
  { name: "نفق الابراهيميه", time: "6:45 AM" },
  { name: "نفق كامب شيزار", time: "6:47 AM" },
  { name: "مستشفي الشاطبي على البحر", time: "6:50 AM" },
  { name: "الشبان المسلمين قبل الترام", time: "6:50 AM" },
  { name: "قناه السويس عند الرادار", time: "6:55 AM" },
  { name: "الموقف عند بنزينة chill out", time: "7:00 AM" },
  { name: "الـ 21 عند حلواني خالد", time: "7:15 AM" },
  { name: "فتحة البرج على الساحل", time: "7:35 AM" },
];

export const EXAM_RETURN_NOTE = "العودة بعد انتهاء الامتحان (سيتم تحديد الميعاد لاحقاً)";

export const COMPANION_RELATIONS = ["أب", "أم", "أخ/أخت", "آخر"] as const;

export const COMPANION_FEE_EGP = 250;
export const INSTAPAY_NUMBER = "01010202281";

export const COMPANION_PAYMENT_NOTICE =
  `💳 برجاء تحويل مبلغ (${COMPANION_FEE_EGP} جنيه) لحجز مقعد المرافق عبر InstaPay أو محفظة إلكترونية على الرقم التالي:\n` +
  `📱 ${INSTAPAY_NUMBER}\n` +
  `ثم قم بإرفاق صورة إيصال / لقطة الشاشة للتحويل أعلاه لتأكيد الحجز.`;

export const DUPLICATE_BOOKING_MESSAGE =
  "عفواً، يوجد حجز مسجل بالفعل بهذا الرقم لهذا اليوم! لا يمكن التكرار.";

function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

export function examConfirmationLink(opts: {
  full_name: string;
  phone: string;
  examDateLabel: string;
  pickupStop: string;
  pickupTime: string;
  passUrl: string;
}): string {
  const message =
    `أهلاً ${opts.full_name} 👋، تم تأكيد حجزك لأتوبيس الامتحان ليوم ${opts.examDateLabel}! 🚌\n` +
    `المحطة: ${opts.pickupStop}\n` +
    `ميعاد التحرك: ${opts.pickupTime}\n` +
    `رابط تصريح الركوب (QR Code): ${opts.passUrl}`;
  return `https://wa.me/${toWhatsAppNumber(opts.phone)}?text=${encodeURIComponent(message)}`;
}

export function examRejectionLink(opts: {
  full_name: string;
  phone: string;
  examDateLabel: string;
}): string {
  const message =
    `عذراً ${opts.full_name}، لم نتمكن من تأكيد حجزك لأتوبيس الامتحان ليوم ${opts.examDateLabel}. ` +
    `برجاء التواصل معنا على الواتساب لمزيد من التفاصيل.`;
  return `https://wa.me/${toWhatsAppNumber(opts.phone)}?text=${encodeURIComponent(message)}`;
}
