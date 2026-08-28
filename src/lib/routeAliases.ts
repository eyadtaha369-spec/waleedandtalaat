/**
 * Roster sheets (Google Forms exports, admin CSVs) rarely spell route
 * names exactly like the `routes` table — "كورنيش" vs "خط البحر",
 * "شارع ابوقير" vs "خط شارع أبو قير", etc. Without normalizing these,
 * a student's `profiles.route` won't match anything in the routes/stops
 * hierarchy and their stop dropdown would end up empty.
 */
const ROUTE_ALIASES: Record<string, string> = {
  "شارع ابوقير": "خط شارع أبو قير",
  ابوقير: "خط شارع أبو قير",
  أبوقير: "خط شارع أبو قير",
  "أبو قير": "خط شارع أبو قير",
  العجمي: "خط العجمي",
  السيوف: "خط السيوف",
  كورنيش: "خط البحر",
  البحر: "خط البحر",
  "جمال عبد الناصر": "خط جمال عبدالناصر",
  "جمال عبدالناصر": "خط جمال عبدالناصر",
  المحمودية: "خط المعمورة ومحمودية",
  المعمورة: "خط المعمورة ومحمودية",
  "المعمورة ومحمودية": "خط المعمورة ومحمودية",
  سموحة: "خط سموحة",
  "كفر الدوار": "خط كفر الدوار",
  "برج العرب": "خط برج العرب",
};

export function normalizeRouteName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return ROUTE_ALIASES[trimmed] ?? trimmed;
}
