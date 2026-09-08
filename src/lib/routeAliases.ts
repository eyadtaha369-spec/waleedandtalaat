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

/**
 * The roster sheet has one column per route (headed with that route's
 * own name, e.g. "خط البحر"), and — despite every column being
 * present for every row — only the ONE column matching a given
 * student's own selected route actually holds their real stop name;
 * every other route's column holds a meaningless leftover number for
 * that row. This maps our canonical route name to the exact header
 * text of its corresponding sheet column, so the right one can be
 * picked per student. The header wording doesn't always match the
 * canonical route name (e.g. a missing space, or an entirely
 * different short form for المعمورة ومحمودية), which is exactly why
 * this can't just reuse ROUTE_ALIASES directly.
 */
const ROUTE_TO_STOP_COLUMN_HEADER: Record<string, string> = {
  "خط البحر": "خط البحر",
  "خط جمال عبدالناصر": "خط جمال عبد الناصر",
  "خط شارع أبو قير": "خط شارع أبوقير",
  "خط سموحة": "خط سموحة",
  "خط العجمي": "خط العجمي",
  "خط السيوف": "خط السيوف",
  "خط المعمورة ومحمودية": "خط المحمودية",
  "خط كفر الدوار": "خط كفر الدوار",
  "خط برج العرب": "خط برج العرب",
};

export function stopColumnHeaderForRoute(canonicalRoute: string): string | undefined {
  return ROUTE_TO_STOP_COLUMN_HEADER[canonicalRoute];
}
