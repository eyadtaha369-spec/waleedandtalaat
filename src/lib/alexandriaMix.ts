export const ALEXANDRIA_MIX_ROUTE = "خط البحر";
export const ALEXANDRIA_MIX_SLOT = "08:00 AM";
// Not in the stops table — specific to the 08:00 AM Alexandria Mix bus.
// خط البحر's own stop list already has a stop literally named "الموقف",
// so it's deliberately not repeated here.
export const ALEXANDRIA_MIX_EXTRA_STOPS = ["قناة السويس عند الرادار", "النجار", "ال 21"];

// The 08:00 AM Alexandria Mix bus now splits into two sub-routes based on
// pickup stop — only meaningful for this slot's morning leg.
export type MorningSubRoute = "el_bahr" | "seyouf_mahmoudia";

export const SEYOUF_MAHMOUDIA_STOPS = [
  "دوران السيوف",
  "كوبري العوايد",
  "أبو سليمان",
  "الحجر",
  "كوبري 14 مايو على المحمودية",
  "الحضرة",
  "أسفل كوبري محرم بك",
  "كرموز",
];

export const SUB_ROUTE_LABELS: Record<MorningSubRoute, string> = {
  el_bahr: "خط البحر (يشمل: البحر / جمال عبد الناصر / أبو قير)",
  seyouf_mahmoudia: "خط السيوف والمحمودية (يشمل: السيوف / سموحة / المحمودية)",
};

export const SUB_ROUTE_SHORT: Record<MorningSubRoute, string> = {
  el_bahr: "خط البحر",
  seyouf_mahmoudia: "خط السيوف والمحمودية",
};

// PLACEHOLDER threshold for recommending a dedicated second bus on the
// Seyouf/Mahmoudia sub-route — owner will confirm the real number.
export const SECOND_BUS_MIN_PASSENGERS = 20;

export function subRouteStops(sub: MorningSubRoute, elBahrStops: string[]): string[] {
  return sub === "el_bahr"
    ? [...elBahrStops, ...ALEXANDRIA_MIX_EXTRA_STOPS]
    : SEYOUF_MAHMOUDIA_STOPS;
}

export function subRouteOf(row: {
  sub_route: string | null;
  pickup_stop: string | null;
}): MorningSubRoute {
  if (row.sub_route === "el_bahr" || row.sub_route === "seyouf_mahmoudia") return row.sub_route;
  return row.pickup_stop && SEYOUF_MAHMOUDIA_STOPS.includes(row.pickup_stop)
    ? "seyouf_mahmoudia"
    : "el_bahr";
}

// 10:00 AM is a second shared morning bus — same idea as the 08:00 AM
// Alexandria Mix, but no sub-route split, and it only picks up from
// Sheraton المندرة onward (خط البحر's own stops 1–6 aren't served by
// this bus) plus the same 3 extra stops.
export const TEN_AM_SLOT = "10:00 AM";
export const TEN_AM_FIRST_STOP = "Sheraton المندرة";

export function tenAmStops(elBahrStops: string[]): string[] {
  const startIndex = elBahrStops.indexOf(TEN_AM_FIRST_STOP);
  const fromFirstStop = startIndex === -1 ? elBahrStops : elBahrStops.slice(startIndex);
  return [...fromFirstStop, ...ALEXANDRIA_MIX_EXTRA_STOPS];
}
