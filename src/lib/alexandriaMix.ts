export const ALEXANDRIA_MIX_ROUTE = "خط البحر";
export const ALEXANDRIA_MIX_SLOT = "08:00 AM";
// Not in the stops table — specific to the 08:00 AM Alexandria Mix bus.
// خط البحر's own stop list already has a stop literally named "الموقف",
// so it's deliberately not repeated here.
export const ALEXANDRIA_MIX_EXTRA_STOPS = ["قناة السويس عند الرادار", "النجار", "ال 21"];

// The 08:00 AM Alexandria Mix bus is a single standard route — خط
// البحر's own stops plus the 3 extra pickup points, same for every
// student regardless of their own registered route.
export function morning0800Stops(elBahrStops: string[]): string[] {
  return [...elBahrStops, ...ALEXANDRIA_MIX_EXTRA_STOPS];
}

// 10:00 AM is a second shared morning bus — same idea as the 08:00 AM
// Alexandria Mix, but it only picks up from Sheraton المندرة onward
// (خط البحر's own stops 1–6 aren't served by this bus) plus the same 3
// extra stops.
export const TEN_AM_SLOT = "10:00 AM";
export const TEN_AM_FIRST_STOP = "Sheraton المندرة";

export function tenAmStops(elBahrStops: string[]): string[] {
  const startIndex = elBahrStops.indexOf(TEN_AM_FIRST_STOP);
  const fromFirstStop = startIndex === -1 ? elBahrStops : elBahrStops.slice(startIndex);
  return [...fromFirstStop, ...ALEXANDRIA_MIX_EXTRA_STOPS];
}
