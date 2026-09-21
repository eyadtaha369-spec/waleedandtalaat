export const TIMEZONE = "Africa/Cairo";

export const MORNING_SLOTS = ["06:00 AM", "08:00 AM"] as const;
export const RETURN_SLOTS = ["12:30 PM", "01:30 PM", "02:30 PM"] as const;
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

/**
 * Default service date for the Route Dashboard's manifest — the date
 * of the morning trip a supervisor most likely wants to see right
 * now, NOT simply "tomorrow relative to this instant."
 *
 * Without a cutoff, defaulting to addDays(now, 1) breaks right after
 * midnight: at 1:00 AM the calendar has already rolled over to the
 * new day, so "tomorrow" jumps to the day AFTER the trip that's
 * actually departing in a few hours (the one booked yesterday
 * evening, whose service date is today's calendar date). Supervisors
 * checking the dashboard between midnight and the early morning would
 * see an empty manifest for a trip that hasn't happened yet, while
 * the real upcoming trip's passengers were hidden a day back.
 *
 * Fix: treat any time before `cutoffHour` (default noon, 12:00 PM) as
 * still "yesterday" for this calculation only — the operating day
 * doesn't roll over until noon, not at midnight. Noon is not
 * arbitrary: it's the exact instant morningWindow() reopens and starts
 * targeting the NEXT day's trip (mins >= 12*60, serviceDate =
 * addDays(now, 1)). Today's own trip — whether it's 1:00 AM or
 * 11:59 AM — must keep resolving to today, since it hasn't departed
 * yet and today's bookings are still keyed to today's date; only once
 * the booking window itself has moved on to tomorrow should this
 * function agree with it. An earlier 4:00 AM cutoff was too early:
 * morning trips depart at 6:00/8:00 AM, so between 4:00 AM and noon it
 * was already rolling students' confirmed today-bookings over to
 * tomorrow, making their pass and dashboard show no booking at all.
 */
export function routeDashboardDefaultDate(now = cairoNow(), cutoffHour = 12): string {
  const mins = minutesOfDay(now);
  const operatingNow = mins < cutoffHour * 60 ? addDays(now, -1) : now;
  return toDateKey(addDays(operatingNow, 1));
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

/**
 * The upcoming Sunday's date — today itself if today is already
 * Sunday, otherwise the next one. Computed dynamically rather than a
 * fixed date so this works for whichever Sunday the admin activates
 * the special-trip toggle for, not just one specific occurrence.
 */
export function nextSunday(now = cairoNow()): Date {
  const day = now.getDay(); // 0 = Sunday, matches Postgres extract(dow from ...)
  return addDays(now, day === 0 ? 0 : 7 - day);
}

/**
 * Special Sunday Trip window: open from whenever the admin turns the
 * toggle on until 6:00 PM the Saturday immediately before the target
 * Sunday. serviceDate is always that Sunday, regardless of which day
 * (Friday, Saturday, or Sunday itself) the student actually books on
 * — this is what makes the QR pass show the right trip date even
 * though the booking action happened earlier in the week.
 */
export function specialSundayWindow(now = cairoNow()): WindowState {
  const target = nextSunday(now);
  const cutoff = addDays(target, -1);
  cutoff.setHours(18, 0, 0, 0);
  return {
    open: now.getTime() <= cutoff.getTime(),
    label: "Special Sunday Trip — until Saturday 6:00 PM",
    serviceDate: toDateKey(target),
    closesAt: "Saturday 6:00 PM",
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
