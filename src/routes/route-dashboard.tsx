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
};

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
  const [rows, setRows] = useState<PassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_route_stop_breakdown", {
        p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
        p_service_date: serviceDate,
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setRows((data as PassengerRow[]) ?? []);
    })();
  }, [effectiveRoute, serviceDate]);

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
  const grouped = useMemo(() => {
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

    const isSearching = searchQuery.length > 0;
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
  }, [filteredRows, stopsByRoute, routes, effectiveRoute, searchQuery]);

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
            <Users className="me-1 size-3.5" /> {filteredRows.length}
          </Badge>
        </div>

        {loading || routesLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : grouped.size === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("routeDash.noStops")}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {[...grouped.entries()].map(([routeName, stops]) => (
              <div key={routeName}>
                {routeFilter === "all" && isAdmin && (
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">{routeName}</p>
                )}
                <Accordion type="multiple" className="rounded-xl border border-border">
                  {[...stops.entries()].map(([stopName, passengers]) => (
                    <AccordionItem key={stopName} value={stopName} className="px-4">
                      <AccordionTrigger>
                        <span className="flex items-center gap-3">
                          <span className="font-medium">{stopName}</span>
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
                            const isCash = p.source === "daily_pass" && p.payment_method === "cash";
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
                                    {p.phone ?? "—"} · {stopName}
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
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
