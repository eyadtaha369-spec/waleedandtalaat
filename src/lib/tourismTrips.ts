import type { Lang } from "@/lib/i18n/translations";

export const CAIRO_TRIP_COVER = "/images/cairo-trip-cover.jpg";

export type TripPackageType = "standard" | "friends";
export type TripPaymentMethod = "instapay" | "wallet";
export type TripBookingStatus = "pending" | "approved" | "rejected";

export const PAYMENT_METHODS: TripPaymentMethod[] = ["instapay", "wallet"];

// Arabic-first labels with the English brand/service name in
// parentheses — plain constants rather than translation keys, like
// the rest of this module's payment-method naming.
export const PAYMENT_METHOD_LABELS: Record<TripPaymentMethod, string> = {
  instapay: "إنستا باي (InstaPay)",
  wallet: "محفظة إلكترونية (E-Wallet)",
};

// Mirrors submit_trip_booking()'s own word-count checks server-side —
// a client-side pre-check so a guest gets immediate feedback instead
// of a round trip just to learn their name is too short.
export const LEAD_NAME_MIN_WORDS = 4;
export const OTHER_NAME_MIN_WORDS = 2;

export const EGYPT_MOBILE_REGEX = /^01[0125][0-9]{8}$/;

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

/** Converts Arabic-Indic/Persian digits to ASCII so phone inputs display and validate consistently. */
export function normalizeDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function wordCount(name: string): number {
  return name.trim().split(/\s+/).filter(Boolean).length;
}

/** "01xxxxxxxxx" -> "20xxxxxxxxx" for wa.me links. */
export function toWhatsAppNumber(phone: string): string {
  const digits = normalizeDigits(phone).replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

/** "2026-11-21" -> "السبت 21/11/2026" (ar) or "Saturday 21/11/2026" (en). */
export function formatTripDate(isoDate: string, lang: Lang): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const weekday = date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: "long" });
  return `${weekday} ${dd}/${mm}/${y}`;
}
