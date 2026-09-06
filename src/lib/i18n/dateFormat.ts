import type { Lang } from "@/lib/i18n/translations";

/** "2026-09-10" -> "الخميس 10 سبتمبر" (ar) or "Thu, Sep 10" (en). */
export function formatLocalizedDate(isoDate: string, lang: Lang): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (lang === "ar") {
    return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

// Fixed set of slot labels used throughout the app — a direct lookup
// is far more reliable than parsing "06:00 AM" strings generically.
const SLOT_LABELS_AR: Record<string, string> = {
  "06:00 AM": "6:00 صباحاً",
  "08:00 AM": "8:00 صباحاً",
  "12:30 PM": "12:30 ظهراً",
  "01:30 PM": "1:30 عصراً",
  "02:30 PM": "2:30 عصراً",
  "04:00 PM": "4:00 عصراً",
};

/** "04:00 PM" -> "4:00 عصراً" (ar) or unchanged (en). */
export function formatSlotLabel(slot: string, lang: Lang): string {
  if (lang === "en") return slot;
  return SLOT_LABELS_AR[slot] ?? slot;
}
