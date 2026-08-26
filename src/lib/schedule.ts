export const TIMEZONE = "Africa/Cairo";

export const ROUTES = [
  "Sidi Gaber",
  "Miami",
  "Smouha",
  "Agami",
  "Borg El Arab",
  "El Mandara",
] as const;

export const STOPS: Record<string, string[]> = {
  "Sidi Gaber": ["Sidi Gaber Station", "Cleopatra", "Roushdy"],
  Miami: ["Miami Bridge", "Asafra", "Sidi Bishr"],
  Smouha: ["Green Plaza", "Smouha Club", "Victor Emanuel"],
  Agami: ["Bitash", "Hanoville", "El Max"],
  "Borg El Arab": ["Borg El Arab Gate", "New Borg City"],
  "El Mandara": ["Mandara Bahary", "El Montaza"],
};

export const MORNING_SLOTS = ["06:00 AM", "08:00 AM"] as const;
export const RETURN_SLOTS = ["12:30 PM", "01:30 PM"] as const;
export const ALL_SLOTS = [...MORNING_SLOTS, ...RETURN_SLOTS, "04:00 PM"] as const;

/** Current wall-clock time in Alexandria, as a plain Date in local fields. */
export function cairoNow(base: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(base);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
}

export function toDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export type WindowState = {
  open: boolean;
  label: string;
  serviceDate: string;
  closesAt: string;
};

/** Morning window: 12:00 PM -> 7:00 PM, books the NEXT day's morning ride. */
export function morningWindow(now = cairoNow()): WindowState {
  const mins = minutesOfDay(now);
  const open = mins >= 12 * 60 && mins < 19 * 60;
  return {
    open,
    label: "12:00 PM – 7:00 PM",
    serviceDate: toDateKey(addDays(now, 1)),
    closesAt: "7:00 PM",
  };
}

/** Return window: 6:30 AM -> 10:30 AM, books the SAME day's early return. */
export function returnWindow(now = cairoNow()): WindowState {
  const mins = minutesOfDay(now);
  const open = mins >= 6 * 60 + 30 && mins < 10 * 60 + 30;
  return {
    open,
    label: "6:30 AM – 10:30 AM",
    serviceDate: toDateKey(now),
    closesAt: "10:30 AM",
  };
}

/** Opt-out of the 4:00 PM bus, allowed until 3:30 PM the same day. */
export function optOutWindow(now = cairoNow()): WindowState {
  return {
    open: minutesOfDay(now) < 15 * 60 + 30,
    label: "Until 3:30 PM",
    serviceDate: toDateKey(now),
    closesAt: "3:30 PM",
  };
}

export function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
