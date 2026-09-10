/**
 * Early-return slots (12:30/1:30/2:30 PM) ignore the student's own
 * assigned route entirely — every early-return bus runs the Sea Route
 * (خط البحر) with a mandatory sector choice relative to Sidi Gaber,
 * each with its own fixed stop list.
 */
export type EarlyReturnSector = "before_sidi_gaber" | "after_sidi_gaber";

export const EARLY_RETURN_ROUTE_NAME = "خط البحر";

export const SECTOR_LABELS: Record<EarlyReturnSector, string> = {
  before_sidi_gaber: "قبل سيدي جابر",
  after_sidi_gaber: "بعد سيدي جابر",
};

export const BEFORE_SIDI_GABER_STOPS = [
  "الـ 21",
  "الموقف",
  "قناة السويس",
  "الشبان المسلمين",
  "الشاطبي",
  "نفق كامب شيزار",
  "نفق الابراهيمية",
  "نفق سبورتينج",
  "نفق كليوبترا",
  "اشارة The Walk",
];

// The rest of خط البحر heading from Sidi Gaber / Mostafa Kamel towards
// Asafra / Montazah / 45 — everything on that route not already
// covered by the "before Sidi Gaber" stretch above.
export const AFTER_SIDI_GABER_STOPS = [
  "Sheraton المندرة",
  "الوردة البيضاء",
  "نفق 45",
  "نفق الاسكندر ابراهيم",
  "إشارة خليل حماده",
  "العزيزية",
  "إشارة جامع سيدي بشر",
  "إشارة محمد نجيب",
  "نفق المحروسه",
  "إشارة الاقبال",
  "إشاره 26 يوليو",
  "إشارة سان ستيفانو",
  "نفق جليم",
  "إشاره شارع سوريا",
];

export function stopsForSector(sector: EarlyReturnSector): string[] {
  return sector === "before_sidi_gaber" ? BEFORE_SIDI_GABER_STOPS : AFTER_SIDI_GABER_STOPS;
}
