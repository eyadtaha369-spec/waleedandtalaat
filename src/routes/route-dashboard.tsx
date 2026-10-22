import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { subscriptionBadge } from "@/lib/subscription";
import { addDays, cairoNow, routeDashboardDefaultDate, toDateKey } from "@/lib/schedule";
import {
  ALEXANDRIA_MIX_ROUTE,
  ALEXANDRIA_MIX_SLOT,
  ALEXANDRIA_MIX_EXTRA_STOPS,
  SEYOUF_MAHMOUDIA_STOPS,
  SUB_ROUTE_SHORT,
  SECOND_BUS_MIN_PASSENGERS,
  MorningSubRoute,
  subRouteOf,
} from "@/lib/alexandriaMix";

export const Route = createFileRoute("/route-dashboard")({
  head: () => ({ meta: [{ title: "Route Dashboard — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <RouteDashboardPage />
    </AdminGuard>
  ),
});

type PassengerRow = {
  route: string | null;
  pickup_stop: string | null;
  stop_order: number | null;
  student_id: string | null;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  subscription_type: string;
  payment_status: string;
  source: string;
  payment_method: string | null;
  slot: string | null;
  sub_route: string | null;
};

const OTHER_STOPS_KEY = "__sub_other_stops__";

const SLOT_OPTIONS = [
  { value: "all", label: null },
  { value: "06:00 AM", label: "06:00 AM" },
  { value: "08:00 AM", label: "08:00 AM (Alexandria Mix)" },
  { value: "09:00 AM", label: "09:00 AM (Borg El-Arab)" },
  { value: "12:30 PM", label: "12:30 PM" },
  { value: "01:30 PM", label: "01:30 PM" },
  { value: "02:30 PM", label: "02:30 PM" },
  { value: "04:00 PM", label: "04:00 PM" },
] as const;

const RETURN_SLOT_VALUES = ["12:30 PM", "01:30 PM", "02:30 PM", "04:00 PM"] as const;

function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function RouteDashboardPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes, stopsByRoute, loading: routesLoading } = useRoutes();

  // Defaults to the trip that's actually upcoming, with a 4:00 AM
  // operating-day cutoff so the view doesn't jump to the wrong date
  // right after midnight — see routeDashboardDefaultDate(). Cairo
  // local time throughout (cairoNow()), never UTC/server time.
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const defaultDate = useMemo(() => routeDashboardDefaultDate(), []);
  const [serviceDate, setServiceDate] = useState<string>(defaultDate);

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [slotFilter, setSlotFilter] = useState<string>("all");
  const [rows, setRows] = useState<PassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");
  const isReturnSlotFilter = (RETURN_SLOT_VALUES as readonly string[]).includes(slotFilter);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_route_stop_breakdown_by_slot_v2", {
        p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
        p_service_date: serviceDate,
        p_slot: slotFilter === "all" ? null : slotFilter,
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setRows((data as PassengerRow[]) ?? []);
    })();
  }, [effectiveRoute, serviceDate, slotFilter]);

  const searchQuery = search.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (!searchQuery) return true;
    return (
      (r.full_name ?? "").toLowerCase().includes(searchQuery) ||
      (r.phone ?? "").includes(searchQuery)
    );
  });

  // get_route_stop_breakdown() only returns rows for stops that actually
  // have a passenger, so a stop with zero bookings has no row at all and
  // would otherwise vanish from the manifest. Build the groups from the
  // master route/stop list (already loaded via useRoutes(), already in
  // display_order) instead of from the fetched rows alone, attaching an
  // empty passengers array to any stop with none — so the full stop
  // sequence always renders, not just the stops someone booked.
  //
  // Search is the one exception: while actively searching for a name/
  // phone, a stop with no matching passenger is hidden rather than shown
  // empty, since the point of a search is to narrow the list down, not
  // to keep showing every stop regardless of match. With the search box
  // empty, every stop shows, including empty ones.
  const isMixMode = slotFilter === ALEXANDRIA_MIX_SLOT;

  const grouped = useMemo(() => {
    const isSearching = searchQuery.length > 0;

    // 08:00 AM (Alexandria Mix) is one shared bus that every route's
    // riders board, regardless of their own route, now split into two
    // sub-routes (خط البحر vs خط السيوف والمحمودية) — one card each,
    // keyed on each sub-route's own physical stop order, with any stop
    // outside that list folded into an "other stops" group at the
    // bottom of that same card rather than silently dropped.
    if (slotFilter === ALEXANDRIA_MIX_SLOT) {
      const buildSubRouteCard = (stopList: string[], sub: MorningSubRoute) => {
        const stopSet = new Set(stopList);
        const map = new Map<string, PassengerRow[]>();
        for (const stopName of stopList) map.set(stopName, []);
        const otherStops: PassengerRow[] = [];

        for (const r of filteredRows) {
          // Placeholder rows (empty stops with nobody booked) exist
          // only to put the stop on the map — not a real passenger.
          if (!r.student_id && !r.full_name) continue;
          if (subRouteOf(r) !== sub) continue;
          const stopKey = r.pickup_stop ?? "—";
          if (stopSet.has(stopKey)) {
            map.get(stopKey)!.push(r);
          } else {
            otherStops.push(r);
          }
        }

        const result = new Map<string, PassengerRow[]>();
        for (const [stopName, passengers] of map) {
          if (isSearching && passengers.length === 0) continue;
          result.set(stopName, passengers);
        }
        if (otherStops.length > 0) result.set(OTHER_STOPS_KEY, otherStops);
        return result;
      };

      const elBahrStops = [
        ...(stopsByRoute[ALEXANDRIA_MIX_ROUTE] ?? []),
        ...ALEXANDRIA_MIX_EXTRA_STOPS,
      ];
      const elBahrCard = buildSubRouteCard(elBahrStops, "el_bahr");
      const seyoufCard = buildSubRouteCard(SEYOUF_MAHMOUDIA_STOPS, "seyouf_mahmoudia");

      const result = new Map<string, Map<string, PassengerRow[]>>();
      if (elBahrCard.size > 0) result.set("__sub_el_bahr__", elBahrCard);
      if (seyoufCard.size > 0) result.set("__sub_seyouf__", seyoufCard);
      return result;
    }

    const byRouteStop = new Map<string, Map<string, PassengerRow[]>>();
    for (const r of filteredRows) {
      const routeKey = r.route ?? "—";
      const stopKey = r.pickup_stop ?? "—";
      if (!byRouteStop.has(routeKey)) byRouteStop.set(routeKey, new Map());
      const stops = byRouteStop.get(routeKey)!;
      if (!stops.has(stopKey)) stops.set(stopKey, []);
      // Placeholder rows (empty stops with nobody booked) exist only to
      // put the stop on the map — they aren't a real passenger to list.
      if (!r.student_id && !r.full_name) continue;
      stops.get(stopKey)!.push(r);
    }

    const routeNames = effectiveRoute && effectiveRoute !== "all" ? [effectiveRoute] : routes;

    const result = new Map<string, Map<string, PassengerRow[]>>();
    for (const routeName of routeNames) {
      const fetchedStops = byRouteStop.get(routeName);
      const stopsMap = new Map<string, PassengerRow[]>();
      for (const stopName of stopsByRoute[routeName] ?? []) {
        const passengers = fetchedStops?.get(stopName) ?? [];
        if (isSearching && passengers.length === 0) continue;
        stopsMap.set(stopName, passengers);
      }
      // A passenger whose pickup_stop isn't in the master list (data
      // drift, or a null pickup_stop grouped under "—") must still show
      // up rather than being silently dropped.
      if (fetchedStops) {
        for (const [stopName, passengers] of fetchedStops) {
          if (!stopsMap.has(stopName)) stopsMap.set(stopName, passengers);
        }
      }
      if (stopsMap.size > 0) result.set(routeName, stopsMap);
    }
    return result;
  }, [filteredRows, stopsByRoute, routes, effectiveRoute, searchQuery, slotFilter]);

  // Banner totals ignore the search box (unlike the cards above) — they
  // reflect the full, route/date/slot-scoped fetch, not a narrowed view.
  const mixBannerCounts = useMemo(() => {
    if (!isMixMode) return null;
    let elBahr = 0;
    let seyouf = 0;
    for (const r of rows) {
      if (!r.student_id && !r.full_name) continue;
      if (subRouteOf(r) === "seyouf_mahmoudia") seyouf++;
      else elBahr++;
    }
    return { elBahr, seyouf, total: elBahr + seyouf };
  }, [isMixMode, rows]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {t("routeDash.upcomingTrip")} · {serviceDate}
          </p>
          <h1 className="text-2xl font-bold">{t("routeDash.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="mb-4">
          <label
            className="mb-1.5 block text-sm font-medium text-muted-foreground"
            htmlFor="route-dashboard-slot"
          >
            {t("routeDash.timeSlot")}
          </label>
          <select
            id="route-dashboard-slot"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
          >
            {SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label ?? t("routeDash.allSlots")}
              </option>
            ))}
          </select>
          {isReturnSlotFilter && (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("routeDash.returnStopsHint")}</p>
          )}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="route-dashboard-date"
          >
            {t("routeDash.tripDate")}
          </label>
          <input
            id="route-dashboard-date"
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs ${
                serviceDate === toDateKey(addDays(cairoNow(), -1))
                  ? "btn-gold border-transparent"
                  : "border-input text-muted-foreground"
              }`}
              onClick={() => setServiceDate(toDateKey(addDays(cairoNow(), -1)))}
            >
              {t("routeDash.yesterday")}
            </button>
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs ${
                serviceDate === todayKey
                  ? "btn-gold border-transparent"
                  : "border-input text-muted-foreground"
              }`}
              onClick={() => setServiceDate(todayKey)}
            >
              {t("routeDash.today")}
            </button>
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs ${
                serviceDate === toDateKey(addDays(cairoNow(), 1))
                  ? "btn-gold border-transparent"
                  : "border-input text-muted-foreground"
              }`}
              onClick={() => setServiceDate(toDateKey(addDays(cairoNow(), 1)))}
            >
              {t("routeDash.tomorrow")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
            >
              <option value="all">{t("students.allRoutes")}</option>
              {routes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <Badge className="btn-gold">{profile?.assigned_route ?? "—"}</Badge>
          )}
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Badge className="ms-auto bg-muted text-muted-foreground">
            <Users className="me-1 size-3.5" />{" "}
            {filteredRows.filter((r) => r.student_id || r.full_name).length}
          </Badge>
        </div>

        {isMixMode && mixBannerCounts && (
          <div className="mb-4 space-y-2 rounded-2xl border border-dashed border-border p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                {t("routeDash.summaryTotalLabel")}: {mixBannerCounts.total}
              </span>
              <span>
                {SUB_ROUTE_SHORT.el_bahr}: {mixBannerCounts.elBahr}
              </span>
              <span>
                {SUB_ROUTE_SHORT.seyouf_mahmoudia}: {mixBannerCounts.seyouf}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${
                  mixBannerCounts.seyouf >= SECOND_BUS_MIN_PASSENGERS ? "bg-success" : "bg-warning"
                }`}
                style={{
                  width: `${Math.min(100, (mixBannerCounts.seyouf / SECOND_BUS_MIN_PASSENGERS) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {mixBannerCounts.seyouf} / {SECOND_BUS_MIN_PASSENGERS}
            </p>
            {mixBannerCounts.seyouf === 0 ? (
              <p className="text-sm text-muted-foreground">{t("routeDash.secondBusNone")}</p>
            ) : mixBannerCounts.seyouf >= SECOND_BUS_MIN_PASSENGERS ? (
              <p className="rounded-lg bg-success/15 p-2 text-sm font-medium text-success-foreground">
                {SUB_ROUTE_SHORT.seyouf_mahmoudia} {t("routeDash.secondBusReady")} (
                {mixBannerCounts.seyouf}/{SECOND_BUS_MIN_PASSENGERS}) —{" "}
                {t("routeDash.secondBusReadyAdvice")}
              </p>
            ) : (
              <p className="rounded-lg bg-warning/15 p-2 text-sm font-medium text-warning-foreground">
                {SUB_ROUTE_SHORT.seyouf_mahmoudia} {t("routeDash.secondBusNotReady")} (
                {mixBannerCounts.seyouf}/{SECOND_BUS_MIN_PASSENGERS}) —{" "}
                {t("routeDash.secondBusNotReadyAdvice")}
              </p>
            )}
          </div>
        )}

        {loading || routesLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : grouped.size === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("routeDash.noStops")}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {[...grouped.entries()].map(([routeName, stops]) => {
              const cardTotal = [...stops.values()].reduce((sum, arr) => sum + arr.length, 0);
              return (
                <div key={routeName}>
                  {(isMixMode || (routeFilter === "all" && isAdmin)) && (
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {isMixMode
                          ? routeName === "__sub_el_bahr__"
                            ? t("routeDash.subRouteElBahrTitle")
                            : t("routeDash.subRouteSeyoufTitle")
                          : routeName}
                      </p>
                      {isMixMode && (
                        <Badge className="btn-gold">
                          {cardTotal} {t("routeDash.passengers")}
                        </Badge>
                      )}
                    </div>
                  )}
                  <Accordion type="multiple" className="rounded-xl border border-border">
                    {[...stops.entries()].map(([stopName, passengers]) => {
                      const displayStopName =
                        stopName === OTHER_STOPS_KEY ? t("routeDash.subRouteOtherStops") : stopName;
                      return (
                        <AccordionItem
                          key={stopName}
                          value={stopName}
                          className={`px-4 ${slotFilter !== "all" && passengers.length === 0 ? "opacity-50" : ""}`}
                        >
                          <AccordionTrigger>
                            <span className="flex items-center gap-3">
                              <span className="font-medium">{displayStopName}</span>
                              <Badge className="btn-gold">
                                {passengers.length} {t("routeDash.passengers")}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="divide-y divide-border">
                              {passengers.map((p, i) => {
                                const badge =
                                  p.source === "daily_pass"
                                    ? null
                                    : subscriptionBadge(p.subscription_type, p.payment_status);
                                const isCash =
                                  p.source === "daily_pass" && p.payment_method === "cash";
                                return (
                                  <li
                                    key={p.student_id ?? `${stopName}-${i}`}
                                    className={`flex flex-wrap items-center gap-3 py-3 ${
                                      isCash ? "bg-warning/15 -mx-4 px-4" : ""
                                    }`}
                                  >
                                    <div className="size-9 shrink-0 overflow-hidden rounded-full">
                                      <SmartAvatar
                                        photoUrl={p.photo_url}
                                        name={p.full_name}
                                        className="size-full text-xs"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium">{p.full_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {p.phone ?? "—"} · {displayStopName}
                                        {isMixMode && ` · ${p.route ?? "—"}`}
                                      </p>
                                      {p.source === "daily_pass" && (
                                        <p className="mt-1 text-xs">
                                          {p.payment_method === "instapay"
                                            ? "InstaPay"
                                            : t("routeDash.cashOnBoard")}
                                        </p>
                                      )}
                                    </div>
                                    {badge ? (
                                      <Badge className={badge.className}>
                                        {badge.emoji} {badge.label}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-orange-500 text-white">
                                        {t("routeDash.dailyPass")}
                                      </Badge>
                                    )}
                                    {p.source === "daily_pass" &&
                                      (p.payment_method === "instapay" ? (
                                        <Badge className="bg-success text-success-foreground">
                                          {t("routeDash.paidConfirmed")}
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-warning text-warning-foreground">
                                          {t("routeDash.cashDue")}
                                        </Badge>
                                      ))}
                                    {p.phone && (
                                      <a
                                        href={`https://wa.me/${toWhatsAppNumber(p.phone)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent"
                                        title={t("routeDash.callWhatsapp")}
                                      >
                                        <MessageCircle className="size-4" />
                                      </a>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
