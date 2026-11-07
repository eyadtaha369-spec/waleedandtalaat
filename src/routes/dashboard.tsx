import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Clock, Lock, MoonStar, Sun, Sunset, TicketCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useRoutes } from "@/hooks/useRoutes";
import { subscriptionBadge } from "@/lib/subscription";
import { formatLocalizedDate, formatSlotLabel } from "@/lib/i18n/dateFormat";
import {
  EarlyReturnSector,
  SECTOR_LABELS,
  EARLY_RETURN_ROUTE_NAME,
  stopsForSector,
} from "@/lib/earlyReturnSectors";
import {
  MORNING_SLOTS,
  RETURN_SLOTS,
  morningWindow,
  routeDashboardDefaultDate,
  specialSundayWindow,
  optOutWindow,
  returnWindow,
  cairoNow,
  isMorning0800Closed,
} from "@/lib/schedule";
import {
  ALEXANDRIA_MIX_ROUTE,
  ALEXANDRIA_MIX_EXTRA_STOPS,
  MorningSubRoute,
  SUB_ROUTE_LABELS,
  SUB_ROUTE_SHORT,
  subRouteStops,
  TEN_AM_SLOT,
  tenAmStops,
} from "@/lib/alexandriaMix";
import {
  clearSessionState,
  readStored,
  useSessionState,
  writeStored,
} from "@/hooks/usePersistentState";

// Shareable slot picks only — morning/return. Everything else on this
// page (stop, sub-route, sector, etc.) is sessionStorage-only, since
// it's identity-adjacent, not a "look at this" link worth sharing.
const dashboardSearchSchema = z.object({
  morning: z.string().optional().catch(undefined),
  ret: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My bookings — Waleed & Talaat Shuttle" },
      {
        name: "description",
        content:
          "Reserve your morning departure and early return seat on the Alexandria to Alamein shuttle.",
      },
      { property: "og:title", content: "My bookings — Waleed & Talaat Shuttle" },
      { property: "og:description", content: "Reserve your daily shuttle seat." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    try {
      return dashboardSearchSchema.parse(search);
    } catch {
      return {};
    }
  },
  component: Dashboard,
});

type DatedValue<T> = { date: string; value: T };

function isDatedValue<T>(v: unknown, isValue: (x: unknown) => x is T): v is DatedValue<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    "date" in v &&
    "value" in v &&
    typeof (v as DatedValue<unknown>).date === "string" &&
    isValue((v as DatedValue<unknown>).value)
  );
}

const isString = (v: unknown): v is string => typeof v === "string";

/**
 * A sessionStorage-backed field that only restores if it was saved for
 * the SAME Cairo service date as right now — a Tuesday pickup-stop pick
 * must never silently carry into Wednesday. Builds on the shared
 * useSessionState, tagging the stored value with its date and checking
 * it on the way back out; nothing beyond this page needs that, so it
 * stays local rather than in the shared hooks file.
 */
function useDatedSessionState<T>(
  key: string,
  serviceDate: string,
  initial: T,
  isValue: (v: unknown) => v is T,
): [T, (v: T) => void] {
  const [stored, setStored] = useSessionState<DatedValue<T> | null>(key, null, {
    validate: (v): v is DatedValue<T> | null => v === null || isDatedValue<T>(v, isValue),
  });
  const value = stored && stored.date === serviceDate ? stored.value : initial;
  // Stable identity (like useState's own setter) so effects that call
  // this don't need it re-listed as a dependency on every render.
  const setValue = useCallback(
    (v: T) => setStored({ date: serviceDate, value: v }),
    [serviceDate, setStored],
  );
  return [value, setValue];
}

const BORG_EL_ARAB_ROUTE = "خط برج العرب";

type Booking = {
  id: string;
  kind: string;
  slot: string;
  service_date: string;
  pickup_stop: string | null;
  route: string | null;
  sector: string | null;
  sub_route: string | null;
};

function Dashboard() {
  const { user, profile, loading, isStaff } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { stopsByRoute } = useRoutes();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [optedOut, setOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [morningStatus, setMorningStatus] = useState<"AUTO" | "FORCE_OPEN" | "FORCE_CLOSED">(
    "AUTO",
  );
  const [returnStatus, setReturnStatus] = useState<"AUTO" | "FORCE_OPEN" | "FORCE_CLOSED">("AUTO");
  const [specialSundayActive, setSpecialSundayActive] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("morning_departure_status, early_return_status, special_sunday_active")
      .eq("id", true)
      .maybeSingle();
    if (data?.morning_departure_status) {
      setMorningStatus(data.morning_departure_status as "AUTO" | "FORCE_OPEN" | "FORCE_CLOSED");
    }
    if (data?.early_return_status) {
      setReturnStatus(data.early_return_status as "AUTO" | "FORCE_OPEN" | "FORCE_CLOSED");
    }
    setSpecialSundayActive(!!data?.special_sunday_active);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const mwBase = useMemo(
    () => (specialSundayActive ? specialSundayWindow() : morningWindow()),
    [specialSundayActive],
  );
  const rwBase = useMemo(() => returnWindow(), []);
  const mw = specialSundayActive
    ? mwBase
    : morningStatus === "FORCE_OPEN"
      ? { ...mwBase, open: true }
      : morningStatus === "FORCE_CLOSED"
        ? { ...mwBase, open: false }
        : mwBase;
  const rw =
    returnStatus === "FORCE_OPEN"
      ? { ...rwBase, open: true }
      : returnStatus === "FORCE_CLOSED"
        ? { ...rwBase, open: false }
        : rwBase;
  const ow = useMemo(() => optOutWindow(), []);
  // mw.serviceDate is morningWindow()'s uncapped addDays(now, 1), which
  // rolls to the wrong day between midnight and the early-morning
  // cutoff (see routeDashboardDefaultDate's own comment). Use the
  // cutoff-aware date for the morning booking's actual service_date
  // everywhere below — but not when a special Sunday trip has already
  // pinned mw.serviceDate to a fixed target date.
  const morningServiceDate = specialSundayActive ? mw.serviceDate : routeDashboardDefaultDate();

  const [nowTick, setNowTick] = useState<Date>(() => cairoNow());
  useEffect(() => {
    const id = setInterval(() => setNowTick(cairoNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  const closed0800 =
    !isStaff && morningStatus !== "FORCE_OPEN" && isMorning0800Closed(morningServiceDate, nowTick);

  const isMorningSubRouteValue = (v: unknown): v is MorningSubRoute | "" =>
    v === "" || v === "el_bahr" || v === "seyouf_mahmoudia";
  const isEarlyReturnSectorValue = (v: unknown): v is EarlyReturnSector | "" =>
    v === "" || (Object.keys(SECTOR_LABELS) as string[]).includes(v as string);

  // stop/subRoute/returnSector/returnStop/fourPmStop survive a tab
  // discard via sessionStorage, but only for the SAME service date —
  // see useDatedSessionState's own doc comment. morningSlot/returnSlot
  // are shareable view state, so they live in the URL instead (with
  // the same date guard applied by hand below, since a plain value in
  // the URL carries no date of its own to check).
  const [stop, setStop] = useDatedSessionState<string>(
    "dashboard.stop",
    morningServiceDate,
    "",
    isString,
  );
  const [subRoute, setSubRoute] = useDatedSessionState<MorningSubRoute | "">(
    "dashboard.subRoute",
    morningServiceDate,
    "",
    isMorningSubRouteValue,
  );
  const [activeMorningSlots, setActiveMorningSlots] = useState<string[]>([...MORNING_SLOTS]);
  const [activeReturnSlots, setActiveReturnSlots] = useState<string[]>([...RETURN_SLOTS]);
  const [morningSlot, setMorningSlotState] = useState<string>(MORNING_SLOTS[0]);
  const [returnSlot, setReturnSlotState] = useState<string>(RETURN_SLOTS[0]);
  const [returnSector, setReturnSector] = useDatedSessionState<EarlyReturnSector | "">(
    "dashboard.returnSector",
    rw.serviceDate,
    "",
    isEarlyReturnSectorValue,
  );
  const [returnStop, setReturnStop] = useDatedSessionState<string>(
    "dashboard.returnStop",
    rw.serviceDate,
    "",
    isString,
  );
  const [fourPmStop, setFourPmStop] = useDatedSessionState<string>(
    "dashboard.fourPmStop",
    rw.serviceDate,
    "",
    isString,
  );

  const persistMorningSlot = (newSlot: string) => {
    setMorningSlotState(newSlot);
    void navigate({ search: (p) => ({ ...p, morning: newSlot }), replace: true });
    writeStored("dashboard.morningSlot", { date: morningServiceDate, value: newSlot });
  };
  const persistReturnSlot = (newSlot: string) => {
    setReturnSlotState(newSlot);
    void navigate({ search: (p) => ({ ...p, ret: newSlot }), replace: true });
    writeStored("dashboard.returnSlot", { date: rw.serviceDate, value: newSlot });
  };

  // Restore the slot picks once on mount: URL -> dated sessionStorage ->
  // default. A backgrounded tab keeps its full URL (query string
  // included) on its own, so this also covers that case — but only
  // when the dated mirror agrees it's still for today; a mirror on
  // record for a DIFFERENT date means the URL value is stale (the tab
  // sat open across a day boundary) and gets dropped along with it. No
  // mirror at all (fresh share-link, or storage blocked) means trust
  // the URL as a best effort.
  useEffect(() => {
    const storedMorning = readStored<DatedValue<string>>("dashboard.morningSlot", {
      validate: (v): v is DatedValue<string> => isDatedValue(v, isString),
    });
    const restoredMorning = storedMorning
      ? storedMorning.date === morningServiceDate
        ? storedMorning.value
        : undefined
      : search.morning;
    if (restoredMorning) persistMorningSlot(restoredMorning);

    const storedReturn = readStored<DatedValue<string>>("dashboard.returnSlot", {
      validate: (v): v is DatedValue<string> => isDatedValue(v, isString),
    });
    const restoredReturn = storedReturn
      ? storedReturn.date === rw.serviceDate
        ? storedReturn.value
        : undefined
      : search.ret;
    if (restoredReturn) persistReturnSlot(restoredReturn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopsForMyRoute = profile?.route ? (stopsByRoute[profile.route] ?? []) : [];
  // The 08:00 AM slot is always the Alexandria Mix bus, running خط
  // البحر's route with three extra pickup points — regardless of the
  // student's own route, since every route's students booking 08:00 AM
  // ride this same shared bus.
  const isAlexandriaMixSlot = morningSlot === "08:00 AM";
  const isTenAmSlot = morningSlot === TEN_AM_SLOT;
  const morningStopOptions = isAlexandriaMixSlot
    ? subRoute
      ? subRouteStops(subRoute, stopsByRoute[ALEXANDRIA_MIX_ROUTE] ?? [])
      : []
    : isTenAmSlot
      ? tenAmStops(stopsByRoute[ALEXANDRIA_MIX_ROUTE] ?? [])
      : stopsForMyRoute;
  // Shared by handleMorningSlotChange and the 08:00-closure fallback
  // effect below to pick the new slot's first stop — never called for
  // "08:00 AM" itself, which always resets to "" pending a sub-route.
  const resetStopOptionsForSlot = (slot: string): string[] =>
    slot === TEN_AM_SLOT ? tenAmStops(stopsByRoute[ALEXANDRIA_MIX_ROUTE] ?? []) : stopsForMyRoute;
  // Return trips drop students off in the reverse order the morning
  // pickup runs the route, so the return dropoff dropdown uses the
  // route's stop list reversed — distinct from stopsForMyRoute, which
  // stays in forward (pickup) order for the morning panel.
  const returnDropoffStops = profile?.route
    ? [...(stopsByRoute[profile.route] ?? [])].reverse()
    : [];
  const isFourPmReturn = returnSlot === "04:00 PM";
  // خط برج العرب's early-return buses run its own route/stops, not the
  // shared Sea Route sector system every other route's 12:30/1:30/2:30
  // PM return uses.
  const isBorgElArabReturn = !isFourPmReturn && profile?.route === BORG_EL_ARAB_ROUTE;
  // Which times are actually offered is admin/supervisor-configurable
  // per route (see /admin/schedules) — this replaces what used to be
  // a hardcoded خط برج العرب-specific override with the general
  // mechanism. Falls back to the full standard set while loading, so
  // the page isn't empty on first render.
  const RETURN_SLOT_CHOICES = [...activeReturnSlots, "04:00 PM"];

  const loadActiveSlots = useCallback(async () => {
    if (!profile?.route) return;
    const { data } = await supabase.rpc("list_active_slots_for_route", {
      p_route: profile.route,
    });
    const rows = (data as { time_slot: string; kind: string }[] | null) ?? [];
    const morning = rows.filter((r) => r.kind === "morning").map((r) => r.time_slot);
    const ret = rows.filter((r) => r.kind === "return").map((r) => r.time_slot);
    if (morning.length > 0) {
      setActiveMorningSlots(morning);
      if (!morning.includes(morningSlot)) persistMorningSlot(morning[0]!);
    }
    if (ret.length > 0) {
      setActiveReturnSlots(ret);
      if (!ret.includes(returnSlot) && returnSlot !== "04:00 PM") persistReturnSlot(ret[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.route, morningSlot, returnSlot]);

  useEffect(() => {
    void loadActiveSlots();
    // Deliberately only re-runs when the student's route changes — see
    // loadActiveSlots' own deps for why morningSlot/returnSlot aren't
    // listed here too (it would re-fire on every slot pick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.route]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (profile?.must_change_password) {
      void navigate({ to: "/change-password" });
    }
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!profile?.route) return;
    const stops = stopsByRoute[profile.route] ?? [];
    const fallback =
      profile.pickup_stop && stops.includes(profile.pickup_stop)
        ? profile.pickup_stop
        : (stops[0] ?? "");
    // Never clobber an already-valid selection — whether restored from
    // a previous session or just picked by the student — with the
    // profile default; only correct it when it's actually missing or
    // no longer valid for the currently relevant option list (which
    // varies by morning slot for `stop`, e.g. an Alexandria Mix stop
    // outside the student's own route).
    if (!stop || !morningStopOptions.includes(stop)) setStop(fallback);
    if (!fourPmStop || !returnDropoffStops.includes(fourPmStop)) setFourPmStop(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, stopsByRoute]);

  const reload = async () => {
    if (!user) return;
    const [{ data: b }, { data: o }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id,kind,slot,service_date,pickup_stop,route,sector,sub_route")
        .in("service_date", [morningServiceDate, rw.serviceDate]),
      supabase.from("opt_outs").select("id").eq("service_date", ow.serviceDate),
    ]);
    setBookings((b as Booking[]) ?? []);
    setOptedOut((o ?? []).length > 0);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, morningServiceDate]);

  useEffect(() => {
    const mb = bookings.find((b) => b.kind === "morning" && b.service_date === morningServiceDate);
    if (mb?.sub_route === "el_bahr" || mb?.sub_route === "seyouf_mahmoudia") {
      setSubRoute(mb.sub_route);
    }
  }, [bookings, morningServiceDate, setSubRoute]);

  const morningBooking = bookings.find(
    (b) => b.kind === "morning" && b.service_date === morningServiceDate,
  );
  const returnBooking = bookings.find(
    (b) => b.kind === "return" && b.service_date === rw.serviceDate,
  );

  const book = async (kind: "morning" | "return") => {
    if (!user) return;
    if (kind === "morning" && morningSlot === "08:00 AM" && closed0800) {
      toast.error(
        "عفواً، تم إغلاق حجز ميعاد 8:00 صباحاً لهذا اليوم (الحد الأقصى للحجز الساعة 6:00 مساءً).",
      );
      return;
    }
    if (kind === "morning" && isAlexandriaMixSlot && !subRoute) {
      toast.error(t("subRoute.chooseFirst"));
      return;
    }
    if (kind === "return") {
      if (isFourPmReturn && !fourPmStop) {
        toast.error(t("dashboard.chooseStopFirst"));
        return;
      }
      if (!isFourPmReturn && isBorgElArabReturn && !returnStop) {
        toast.error(t("dashboard.chooseStopFirst"));
        return;
      }
      if (!isFourPmReturn && !isBorgElArabReturn && (!returnSector || !returnStop)) {
        toast.error(t("dashboard.chooseSectorStopFirst"));
        return;
      }
    }
    setBusy(true);
    const payload = {
      student_id: user.id,
      kind,
      slot: kind === "morning" ? morningSlot : returnSlot,
      service_date: kind === "morning" ? morningServiceDate : rw.serviceDate,
      route:
        kind === "morning" || isFourPmReturn || isBorgElArabReturn
          ? (profile?.route ?? null)
          : EARLY_RETURN_ROUTE_NAME,
      pickup_stop: kind === "morning" ? stop : isFourPmReturn ? fourPmStop : returnStop,
      sector: kind === "return" && !isFourPmReturn && !isBorgElArabReturn ? returnSector : null,
      sub_route: kind === "morning" && morningSlot === "08:00 AM" ? subRoute : null,
    };
    const { error } = await supabase
      .from("bookings")
      .upsert(payload, { onConflict: "student_id,service_date,kind" });
    setBusy(false);
    if (error) {
      if (error.code === "23514") return toast.error(t("subRoute.mismatch"));
      return toast.error(error.message);
    }
    toast.success(
      kind === "morning" ? t("dashboard.morningReserved") : t("dashboard.returnReserved"),
    );
    void reload();
  };

  const handleMorningSlotChange = (newSlot: string) => {
    persistMorningSlot(newSlot);
    // The valid stop list depends on the slot (Alexandria Mix's extra
    // stops only apply to 08:00 AM/10:00 AM) — reset to the new list's
    // first option so a student can't submit a stop that's no longer
    // valid. 08:00 AM has no stops yet until a sub-route is chosen.
    setSubRoute("");
    setStop(newSlot === "08:00 AM" ? "" : (resetStopOptionsForSlot(newSlot)[0] ?? ""));
  };

  const handleSubRouteChange = (newSubRoute: MorningSubRoute) => {
    setSubRoute(newSubRoute);
    const newOptions = subRouteStops(newSubRoute, stopsByRoute[ALEXANDRIA_MIX_ROUTE] ?? []);
    setStop(newOptions[0] ?? "");
  };

  useEffect(() => {
    if (morningSlot !== "08:00 AM" || !closed0800) return;
    const fallbackSlot =
      activeMorningSlots.find((s) => s !== "08:00 AM") ?? activeMorningSlots[0] ?? MORNING_SLOTS[0];
    persistMorningSlot(fallbackSlot);
    setSubRoute("");
    setStop(resetStopOptionsForSlot(fallbackSlot)[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed0800, morningSlot, activeMorningSlots]);

  const cancel = async (id: string) => {
    await supabase.from("bookings").delete().eq("id", id);
    toast.success(t("dashboard.bookingCancelled"));
    void reload();
  };

  const toggleOptOut = async () => {
    if (!user) return;
    setBusy(true);
    if (optedOut) {
      await supabase.from("opt_outs").delete().eq("service_date", ow.serviceDate);
    } else {
      await supabase.from("opt_outs").insert({ student_id: user.id, service_date: ow.serviceDate });
    }
    setBusy(false);
    void reload();
  };

  // Latest-callback refs so the visibility listener below (registered
  // once, on mount) never calls a stale closure — same pattern as
  // pass.tsx's fetchBookingsRef.
  const reloadRef = useRef(reload);
  const loadSettingsRef = useRef(loadSettings);
  const loadActiveSlotsRef = useRef(loadActiveSlots);
  useEffect(() => {
    reloadRef.current = reload;
    loadSettingsRef.current = loadSettings;
    loadActiveSlotsRef.current = loadActiveSlots;
  });

  // A tab that's just sitting open can go stale — bookings change,
  // the admin flips a FORCE_OPEN/CLOSED switch, a route's active slots
  // change. Refetch all three on return without touching any selection
  // the student already made; a selection only changes if it's no
  // longer valid (handled inside loadActiveSlots / the closed0800
  // effect above), never unconditionally reset.
  useEffect(() => {
    const onVisible = () => {
      void reloadRef.current();
      void loadSettingsRef.current();
      void loadActiveSlotsRef.current();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) onVisible();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onVisible();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (loading || !profile) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <ProfileAvatar />
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {t("dashboard.welcomeBack")}
          </p>
          <h1 className="text-2xl font-bold">{profile.full_name || t("dashboard.student")}</h1>
          <p className="mt-1 text-sm opacity-80">
            {profile.route ?? t("dashboard.noRouteSet")} ·{" "}
            {profile.pickup_stop ?? t("dashboard.noStopSet")}
          </p>
          <Badge
            className={`mt-2 ${subscriptionBadge(profile.subscription_type, profile.payment_status).className}`}
          >
            {subscriptionBadge(profile.subscription_type, profile.payment_status).emoji}{" "}
            {subscriptionBadge(profile.subscription_type, profile.payment_status).label}
          </Badge>
        </div>
        <div className="border-gilded ms-auto rounded-2xl px-5 py-3 text-center">
          <p className="text-xs opacity-70 uppercase">
            {profile.subscription_type === "70_trips"
              ? t("dashboard.tripsRemaining")
              : t("dashboard.subscription")}
          </p>
          <p className="text-gilded text-xl font-bold">
            {profile.subscription_type === "70_trips"
              ? `${profile.trips_remaining}/${profile.trips_total}`
              : t("dashboard.fullTerm")}
          </p>
          {profile.subscription_type === "70_trips" && (
            <Link
              to="/trips"
              className="mt-1 block text-[11px] underline underline-offset-2 opacity-80"
            >
              {t("dashboard.viewScanHistory")}
            </Link>
          )}
        </div>
        <Link to="/pass">
          <Button className="btn-gold">
            <TicketCheck className="size-4" /> {t("nav.boardingPass")}
          </Button>
        </Link>
      </div>

      {specialSundayActive && (
        <div className="mt-6 rounded-2xl border-2 border-accent/60 bg-accent/10 p-4 text-center">
          <p className="font-semibold">{t("dashboard.specialSundayBanner")}</p>
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Panel
          icon={Sun}
          title={t("dashboard.morningDeparture")}
          subtitle={`${t("dashboard.for")} ${formatLocalizedDate(morningServiceDate, lang)}`}
          window={mw.label}
          open={mw.open}
        >
          {morningBooking ? (
            <Confirmed
              t={t}
              text={`${formatSlotLabel(morningBooking.slot, lang)} · ${morningBooking.pickup_stop ?? ""}${
                morningBooking.sub_route === "el_bahr" ||
                morningBooking.sub_route === "seyouf_mahmoudia"
                  ? ` · ${SUB_ROUTE_SHORT[morningBooking.sub_route]}`
                  : ""
              }`}
              onCancel={mw.open ? () => void cancel(morningBooking.id) : undefined}
            />
          ) : mw.open ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2">
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                  {t("dashboard.yourRoute")}
                </p>
                <p className="text-sm font-semibold">
                  {profile.route ?? t("dashboard.noRouteContactAdmin")}
                </p>
              </div>
              {isAlexandriaMixSlot && (
                <div className="space-y-2">
                  <Label>{t("subRoute.chooseLabel")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={subRoute}
                    onChange={(e) => handleSubRouteChange(e.target.value as MorningSubRoute)}
                  >
                    <option value="" disabled>
                      {t("subRoute.chooseLabel")}
                    </option>
                    {(Object.keys(SUB_ROUTE_LABELS) as MorningSubRoute[]).map((sr) => (
                      <option key={sr} value={sr}>
                        {SUB_ROUTE_LABELS[sr]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <SelectField
                label={t("dashboard.departureStopLabel")}
                value={stop}
                options={morningStopOptions}
                onChange={setStop}
                disabled={isAlexandriaMixSlot && !subRoute}
              />
              <SlotPicker
                label={t("dashboard.timeSlot")}
                options={activeMorningSlots}
                value={morningSlot}
                onChange={handleMorningSlotChange}
                lang={lang}
                isOptionDisabled={(o) => o === "08:00 AM" && closed0800}
                optionLabel={(o) =>
                  o === "08:00 AM" && closed0800
                    ? `${formatSlotLabel(o, lang)} ${t("schedule.slot0800Closed")}`
                    : formatSlotLabel(o, lang)
                }
              />
              <Button
                className="btn-gold w-full"
                disabled={
                  busy ||
                  !profile.route ||
                  (isAlexandriaMixSlot && !subRoute) ||
                  (morningSlot === "08:00 AM" && closed0800)
                }
                onClick={() => void book("morning")}
              >
                {t("dashboard.reserveSeat")}
              </Button>
            </div>
          ) : (
            <Closed text={t("dashboard.morningClosedNote")} />
          )}
        </Panel>

        <Panel
          icon={Sunset}
          title={t("dashboard.earlyReturn")}
          subtitle={`${t("dashboard.for")} ${formatLocalizedDate(rw.serviceDate, lang)}`}
          window={rw.label}
          open={rw.open}
        >
          {returnBooking ? (
            <Confirmed
              t={t}
              text={`${formatSlotLabel(returnBooking.slot, lang)} · ${returnBooking.sector ? SECTOR_LABELS[returnBooking.sector as EarlyReturnSector] + " · " : ""}${returnBooking.pickup_stop ?? ""}`}
              onCancel={rw.open ? () => void cancel(returnBooking.id) : undefined}
            />
          ) : rw.open ? (
            <div className="space-y-4">
              <SlotPicker
                label={t("dashboard.timeSlot")}
                options={RETURN_SLOT_CHOICES}
                value={returnSlot}
                onChange={persistReturnSlot}
                lang={lang}
              />

              {isFourPmReturn ? (
                <>
                  <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2">
                    <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                      {t("dashboard.yourRoute")}
                    </p>
                    <p className="text-sm font-semibold">
                      {profile.route ?? t("dashboard.noRouteContactAdmin")}
                    </p>
                  </div>
                  <SelectField
                    label={t("dashboard.dropoffStop")}
                    value={fourPmStop}
                    options={returnDropoffStops}
                    onChange={setFourPmStop}
                  />
                </>
              ) : isBorgElArabReturn ? (
                <>
                  <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2">
                    <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                      {t("dashboard.yourRoute")}
                    </p>
                    <p className="text-sm font-semibold">
                      {profile.route ?? t("dashboard.noRouteContactAdmin")}
                    </p>
                  </div>
                  <SelectField
                    label={t("dashboard.dropoffStop")}
                    value={returnStop}
                    options={returnDropoffStops}
                    onChange={setReturnStop}
                  />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>{t("dashboard.sector")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(SECTOR_LABELS) as EarlyReturnSector[]).map((sector) => (
                        <button
                          key={sector}
                          type="button"
                          onClick={() => {
                            setReturnSector(sector);
                            setReturnStop(stopsForSector(sector)[0] ?? "");
                          }}
                          className={`rounded-md border px-3 py-2 text-sm ${
                            returnSector === sector
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-input bg-background"
                          }`}
                        >
                          {SECTOR_LABELS[sector]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {returnSector && (
                    <SelectField
                      label={t("dashboard.dropoffStop")}
                      value={returnStop}
                      options={stopsForSector(returnSector)}
                      onChange={setReturnStop}
                    />
                  )}
                </>
              )}

              <Button
                className="btn-gold w-full"
                disabled={
                  busy ||
                  (isFourPmReturn
                    ? !fourPmStop || !profile.route
                    : isBorgElArabReturn
                      ? !returnStop
                      : !returnSector || !returnStop)
                }
                onClick={() => void book("return")}
              >
                {t("dashboard.reserveReturnSeat")}
              </Button>
            </div>
          ) : (
            <Closed text={t("dashboard.returnClosedNote")} />
          )}
        </Panel>
      </div>

      <div className="mt-5 rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <MoonStar className="text-accent mt-1 size-5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t("dashboard.fourPmTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.fourPmBody")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant={optedOut ? "secondary" : "outline"}
                disabled={busy || !ow.open}
                onClick={() => void toggleOptOut()}
              >
                {optedOut ? t("dashboard.undoOptOut") : t("dashboard.optOutButton")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {ow.open ? t("dashboard.availableUntil") : t("dashboard.closedForToday")}
              </span>
              {optedOut && (
                <Badge className="bg-warning text-warning-foreground">
                  {t("dashboard.optedOut")}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  window: win,
  open,
  children,
}: {
  icon: typeof Sun;
  title: string;
  subtitle: string;
  window: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <Icon className="text-accent size-5" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge
          className={`ms-auto ${open ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}
        >
          <Clock className="me-1 size-3" /> {win}
        </Badge>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SlotPicker({
  label,
  options,
  value,
  onChange,
  lang,
  isOptionDisabled,
  optionLabel,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  lang: "ar" | "en";
  isOptionDisabled?: (v: string) => boolean;
  optionLabel?: (v: string) => string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const disabled = isOptionDisabled?.(o) ?? false;
          return (
            <button
              key={o}
              disabled={disabled}
              onClick={() => onChange(o)}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                disabled
                  ? "cursor-not-allowed border-border opacity-50"
                  : value === o
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border hover:bg-secondary"
              }`}
            >
              {optionLabel ? optionLabel(o) : formatSlotLabel(o, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  isOptionDisabled,
  optionLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  isOptionDisabled?: (v: string) => boolean;
  optionLabel?: (v: string) => string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o} disabled={isOptionDisabled?.(o)}>
            {optionLabel ? optionLabel(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Confirmed({
  text,
  onCancel,
  t,
}: {
  text: string;
  onCancel?: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary p-5">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">
        {t("dashboard.confirmed")}
      </p>
      <p className="mt-1 text-xl font-bold">{text}</p>
      {onCancel && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          {t("dashboard.cancelBooking")}
        </Button>
      )}
    </div>
  );
}

function Closed({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
