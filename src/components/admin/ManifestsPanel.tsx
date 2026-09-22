import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALL_SLOTS, cairoNow, MORNING_SLOTS, RETURN_SLOTS, toDateKey } from "@/lib/schedule";
import { SECTOR_LABELS, type EarlyReturnSector } from "@/lib/earlyReturnSectors";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";

type Row = {
  student_id: string;
  full_name: string;
  route: string | null;
  pickup_stop: string | null;
  sector: string | null;
  payment_status: string;
};

type PaymentFilter = "all" | "paid_full" | "installment_pending";

type EarlyReturnSlotRow = {
  slot: string;
  total_booked: number;
  qr_scanned: number;
  walk_in_count: number;
  total_onboard: number;
};
type MorningRouteRow = {
  route: string;
  slot: string;
  qr_scanned: number;
  walk_in_count: number;
  total_onboard: number;
};

export function ManifestsPanel() {
  const { t } = useLanguage();
  const { routes, stopsByRoute } = useRoutes();
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [date, setDate] = useState<string>(todayKey);
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [slotTotals, setSlotTotals] = useState<{ kind: string; slot: string; total: number }[]>([]);
  const [earlyReturnRows, setEarlyReturnRows] = useState<EarlyReturnSlotRow[]>([]);
  const [morningRouteRows, setMorningRouteRows] = useState<MorningRouteRow[]>([]);

  const isEarlyReturn = (RETURN_SLOTS as readonly string[]).includes(slot);

  const stopIndex = (route: string | null, stop: string | null): number => {
    if (!route || !stop) return Number.MAX_SAFE_INTEGER;
    const idx = stopsByRoute[route]?.indexOf(stop) ?? -1;
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx; // unknown/custom stops sort last, never crash
  };

  useEffect(() => {
    // "early-returns"/"morning-departure" are summary tabs, not real
    // slots — nothing to fetch for the per-slot manifest here.
    if ((ALL_SLOTS as readonly string[]).includes(slot)) {
      void load(slot, date);
    }
  }, [slot, date]);

  const loadSlotTotals = async (currentDate: string) => {
    const { data } = await supabase.rpc("get_slot_totals", { p_date: currentDate });
    setSlotTotals(data ?? []);
  };

  const loadEarlyReturnSummary = async (currentDate: string) => {
    const { data } = await supabase.rpc("get_early_return_slot_summary", { p_date: currentDate });
    setEarlyReturnRows(data ?? []);
  };

  const loadMorningDepartureSummary = async (currentDate: string) => {
    const { data } = await supabase.rpc("get_morning_departure_route_summary", {
      p_date: currentDate,
    });
    setMorningRouteRows(data ?? []);
  };

  useEffect(() => {
    void loadSlotTotals(date);
    void loadEarlyReturnSummary(date);
    void loadMorningDepartureSummary(date);
    // Recalculate live as bookings/opt-outs/scans/walk-ins change for
    // this date, not just when the admin changes a filter themselves.
    const channel = supabase
      .channel(`manifest-totals-${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `service_date=eq.${date}` },
        () => {
          void loadSlotTotals(date);
          void loadEarlyReturnSummary(date);
          void loadMorningDepartureSummary(date);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opt_outs", filter: `service_date=eq.${date}` },
        () => {
          void loadSlotTotals(date);
          void loadEarlyReturnSummary(date);
          void loadMorningDepartureSummary(date);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `service_date=eq.${date}` },
        () => {
          void loadEarlyReturnSummary(date);
          void loadMorningDepartureSummary(date);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walk_in_passengers",
          filter: `service_date=eq.${date}`,
        },
        () => {
          void loadEarlyReturnSummary(date);
          void loadMorningDepartureSummary(date);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [date]);

  const load = async (currentSlot: string, currentDate: string) => {
    setLoading(true);
    if (currentSlot === "04:00 PM") {
      const [{ data: optedOut }, { data: profiles }, { data: fourPmBookings }] = await Promise.all([
        supabase.from("opt_outs").select("student_id").eq("service_date", currentDate),
        supabase.from("profiles").select("id,full_name,route,pickup_stop,payment_status"),
        supabase
          .from("bookings")
          .select("student_id,route,pickup_stop")
          .eq("service_date", currentDate)
          .eq("kind", "return")
          .eq("slot", "04:00 PM"),
      ]);
      const excluded = new Set((optedOut ?? []).map((o) => o.student_id));
      const bookingById = new Map((fourPmBookings ?? []).map((b) => [b.student_id, b]));

      const built = (profiles ?? [])
        .filter((p) => !excluded.has(p.id))
        .map((p) => {
          // A student who proactively booked 4:00 PM has their exact
          // chosen stop; everyone else falls back to their registered
          // route/stop under the guaranteed-seat default.
          const booking = bookingById.get(p.id);
          return {
            student_id: p.id,
            full_name: p.full_name,
            route: booking?.route ?? p.route,
            pickup_stop: booking?.pickup_stop ?? p.pickup_stop,
            sector: null,
            payment_status: p.payment_status,
          };
        })
        .sort(
          (a, b) =>
            (a.route ?? "").localeCompare(b.route ?? "") ||
            stopIndex(a.route, a.pickup_stop) - stopIndex(b.route, b.pickup_stop),
        );
      setRows(built);
    } else {
      const kind = (MORNING_SLOTS as readonly string[]).includes(currentSlot)
        ? "morning"
        : "return";
      const { data: bookings } = await supabase
        .from("bookings")
        .select("student_id,route,pickup_stop,sector")
        .eq("service_date", currentDate)
        .eq("kind", kind)
        .eq("slot", currentSlot);

      const ids = (bookings ?? []).map((b) => b.student_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id,full_name,payment_status").in("id", ids)
        : { data: [] };
      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

      setRows(
        (bookings ?? [])
          .map((b) => ({
            student_id: b.student_id,
            full_name: profileById.get(b.student_id)?.full_name ?? "—",
            route: b.route,
            pickup_stop: b.pickup_stop,
            sector: b.sector,
            payment_status: profileById.get(b.student_id)?.payment_status ?? "paid_full",
          }))
          .sort((a, b) => stopIndex(a.route, a.pickup_stop) - stopIndex(b.route, b.pickup_stop)),
      );
    }
    setLoading(false);
  };

  const filteredRows = rows.filter(
    (r) =>
      (paymentFilter === "all" || r.payment_status === paymentFilter) &&
      (routeFilter === "all" || r.route === routeFilter),
  );
  const installmentCount = rows.filter((r) => r.payment_status === "installment_pending").length;

  const bySector = (sector: EarlyReturnSector) => filteredRows.filter((r) => r.sector === sector);

  const byRoute = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const key = r.route ?? t("manifests.noRouteAssigned");
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  // Not every early-return booking uses the Sea Route sector system —
  // خط برج العرب runs its own return route with a direct stop pick
  // instead, so those rows have sector = null and would otherwise
  // vanish from the sector-grouped early-return tab entirely. Group
  // them by route instead, same as the 04:00 PM tab does.
  const noSectorByRoute = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of filteredRows) {
      if (r.sector) continue;
      const key = r.route ?? t("manifests.noRouteAssigned");
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <Tabs value={slot} onValueChange={setSlot}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="manifest-date">
            {t("manifests.date")}
          </label>
          <input
            id="manifest-date"
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {date !== todayKey && (
            <button
              type="button"
              className="text-xs text-accent underline underline-offset-2"
              onClick={() => setDate(todayKey)}
            >
              {t("manifests.resetToday")} ({todayKey})
            </button>
          )}
        </div>

        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
          <TabsTrigger
            value="early-returns"
            className="rounded-full border border-border data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
          >
            {t("manifests.earlyReturnsTab")}
          </TabsTrigger>
          <TabsTrigger
            value="morning-departure"
            className="rounded-full border border-border data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
          >
            {t("manifests.morningDepartureTab")}
          </TabsTrigger>
          {ALL_SLOTS.map((s) => (
            <TabsTrigger
              key={s}
              value={s}
              className="rounded-full border border-border data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
            >
              {s}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          value={(ALL_SLOTS as readonly string[]).includes(slot) ? slot : "__none__"}
          className="mt-5"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className="btn-gold">
              <Users className="me-1 size-3.5" /> {filteredRows.length}{" "}
              {t("manifests.totalPassenger")}
              {filteredRows.length === 1 ? "" : "s"}
            </Badge>
            {installmentCount > 0 && (
              <Badge className="bg-warning text-warning-foreground">
                🟡 {installmentCount} قسط
              </Badge>
            )}
            {slot === "04:00 PM" && (
              <span className="text-xs text-muted-foreground">
                {t("manifests.allSubscribedNote")} {date}
              </span>
            )}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            >
              <option value="all">{t("manifests.allPaymentStatuses")}</option>
              <option value="paid_full">{t("manifests.paidInFull")}</option>
              <option value="installment_pending">{t("manifests.installmentPending")}</option>
            </select>
          </div>

          {slotTotals.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
              <span className="text-xs font-medium text-muted-foreground">
                {t("manifests.perDepartureTime")}:
              </span>
              {slotTotals
                .slice()
                .sort(
                  (a, b) => ALL_SLOTS.indexOf(a.slot as never) - ALL_SLOTS.indexOf(b.slot as never),
                )
                .map((s) => (
                  <Badge
                    key={`${s.kind}-${s.slot}`}
                    className="bg-secondary text-secondary-foreground"
                  >
                    {s.slot} — {s.total}
                  </Badge>
                ))}
            </div>
          )}

          {byRoute.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
              <span className="text-xs font-medium text-muted-foreground">
                {t("manifests.perRoute")}:
              </span>
              {byRoute.map(([routeName, group]) => (
                <Badge key={routeName} className="bg-accent/20 text-accent-foreground">
                  {routeName} — {group.length}
                </Badge>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">{t("manifests.loadingManifest")}</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("manifests.noPassengers")}</p>
          ) : isEarlyReturn ? (
            <div className="space-y-6">
              {(Object.keys(SECTOR_LABELS) as EarlyReturnSector[]).map((sector) => {
                const group = bySector(sector);
                return (
                  <div key={sector}>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge className="bg-accent text-accent-foreground">
                        {SECTOR_LABELS[sector]} — {group.length}
                      </Badge>
                      {group.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {group.length <= 33
                            ? t("manifests.fitsSmall")
                            : t("manifests.needsLarge")}
                        </span>
                      )}
                    </div>
                    {group.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("manifests.noPassengersSector")}
                      </p>
                    ) : (
                      <ManifestTable rows={group} />
                    )}
                  </div>
                );
              })}
              {noSectorByRoute.map(([routeName, group]) => (
                <div key={routeName}>
                  <div className="mb-2">
                    <Badge className="bg-accent text-accent-foreground">
                      {routeName} — {group.length}
                    </Badge>
                  </div>
                  <ManifestTable rows={group} />
                </div>
              ))}
            </div>
          ) : slot === "04:00 PM" ? (
            <div className="space-y-6">
              {byRoute.map(([routeName, group]) => (
                <div key={routeName}>
                  <div className="mb-2">
                    <Badge className="bg-accent text-accent-foreground">
                      {routeName} — {group.length}
                    </Badge>
                  </div>
                  <ManifestTable rows={group} />
                </div>
              ))}
            </div>
          ) : (
            <ManifestTable rows={filteredRows} />
          )}
        </TabsContent>

        <TabsContent value="early-returns" className="mt-5">
          {earlyReturnRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("manifests.noPassengers")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("manifests.timeSlot")}</TableHead>
                  <TableHead>{t("manifests.totalBooked")}</TableHead>
                  <TableHead>{t("manifests.qrScanned")}</TableHead>
                  <TableHead>{t("manifests.walkInCount")}</TableHead>
                  <TableHead>{t("manifests.totalOnboard")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earlyReturnRows.map((r) => (
                  <TableRow key={r.slot}>
                    <TableCell className="font-medium">{r.slot}</TableCell>
                    <TableCell>{r.total_booked}</TableCell>
                    <TableCell>{r.qr_scanned}</TableCell>
                    <TableCell>{r.walk_in_count}</TableCell>
                    <TableCell className="font-semibold">{r.total_onboard}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="morning-departure" className="mt-5">
          {morningRouteRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("manifests.noPassengers")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.route")}</TableHead>
                  <TableHead>{t("manifests.timeSlot")}</TableHead>
                  <TableHead>{t("manifests.qrScanned")}</TableHead>
                  <TableHead>{t("manifests.walkInCount")}</TableHead>
                  <TableHead>{t("manifests.totalOnboard")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {morningRouteRows.map((r) => (
                  <TableRow key={`${r.route}-${r.slot}`}>
                    <TableCell className="font-medium">{r.route}</TableCell>
                    <TableCell>{r.slot}</TableCell>
                    <TableCell>{r.qr_scanned}</TableCell>
                    <TableCell>{r.walk_in_count}</TableCell>
                    <TableCell className="font-semibold">{r.total_onboard}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ManifestTable({ rows }: { rows: Row[] }) {
  const { t } = useLanguage();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("common.name")}</TableHead>
          <TableHead>{t("common.route")}</TableHead>
          <TableHead>{t("common.stop")}</TableHead>
          <TableHead>{t("manifests.payment")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.student_id}>
            <TableCell className="font-medium">{r.full_name}</TableCell>
            <TableCell>{r.route ?? "—"}</TableCell>
            <TableCell>{r.pickup_stop ?? "—"}</TableCell>
            <TableCell>
              {r.payment_status === "installment_pending" ? (
                <Badge className="bg-warning text-warning-foreground">🟡 قسط</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{t("common.paid")}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
