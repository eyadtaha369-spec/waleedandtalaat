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

type Row = {
  student_id: string;
  full_name: string;
  route: string | null;
  pickup_stop: string | null;
  sector: string | null;
  payment_status: string;
};

type PaymentFilter = "all" | "paid_full" | "installment_pending";

export function ManifestsPanel() {
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [date, setDate] = useState<string>(todayKey);
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  const isEarlyReturn = (RETURN_SLOTS as readonly string[]).includes(slot);

  useEffect(() => {
    void load(slot, date);
  }, [slot, date]);

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
            (a.pickup_stop ?? "").localeCompare(b.pickup_stop ?? ""),
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
        (bookings ?? []).map((b) => ({
          student_id: b.student_id,
          full_name: profileById.get(b.student_id)?.full_name ?? "—",
          route: b.route,
          pickup_stop: b.pickup_stop,
          sector: b.sector,
          payment_status: profileById.get(b.student_id)?.payment_status ?? "paid_full",
        })),
      );
    }
    setLoading(false);
  };

  const filteredRows = rows.filter(
    (r) => paymentFilter === "all" || r.payment_status === paymentFilter,
  );
  const installmentCount = rows.filter((r) => r.payment_status === "installment_pending").length;

  const bySector = (sector: EarlyReturnSector) => filteredRows.filter((r) => r.sector === sector);

  const byRoute = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of filteredRows) {
      const key = r.route ?? "No route assigned";
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
            Date
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
              Reset to today ({todayKey})
            </button>
          )}
        </div>

        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
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

        <TabsContent value={slot} className="mt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className="btn-gold">
              <Users className="me-1 size-3.5" /> {filteredRows.length} total passenger
              {filteredRows.length === 1 ? "" : "s"}
            </Badge>
            {installmentCount > 0 && (
              <Badge className="bg-warning text-warning-foreground">
                🟡 {installmentCount} قسط
              </Badge>
            )}
            {slot === "04:00 PM" && (
              <span className="text-xs text-muted-foreground">
                All subscribed students not opted out on {date}
              </span>
            )}
            <select
              className="ms-auto h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            >
              <option value="all">All payment statuses</option>
              <option value="paid_full">Paid in full</option>
              <option value="installment_pending">Installment pending (قسط)</option>
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading manifest…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passengers match this view.</p>
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
                          {group.length <= 33 ? "fits a 33-seater" : "needs a 50-seater"}
                        </span>
                      )}
                    </div>
                    {group.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No passengers in this sector.</p>
                    ) : (
                      <ManifestTable rows={group} />
                    )}
                  </div>
                );
              })}
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
      </Tabs>
    </section>
  );
}

function ManifestTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Stop</TableHead>
          <TableHead>Payment</TableHead>
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
                <span className="text-xs text-muted-foreground">Paid</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
