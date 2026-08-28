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
import { ALL_SLOTS, cairoNow, MORNING_SLOTS, toDateKey } from "@/lib/schedule";

type Row = {
  student_id: string;
  full_name: string;
  route: string | null;
  pickup_stop: string | null;
  payment_status: string;
};

type PaymentFilter = "all" | "paid_full" | "installment_pending";

export function ManifestsPanel() {
  const today = useMemo(() => toDateKey(cairoNow()), []);
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  useEffect(() => {
    void load(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const load = async (currentSlot: string) => {
    setLoading(true);
    if (currentSlot === "04:00 PM") {
      const { data: optedOut } = await supabase
        .from("opt_outs")
        .select("student_id")
        .eq("service_date", today);
      const excluded = new Set((optedOut ?? []).map((o) => o.student_id));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,route,pickup_stop,payment_status")
        .order("route");
      setRows(
        (profiles ?? [])
          .filter((p) => !excluded.has(p.id))
          .map((p) => ({
            student_id: p.id,
            full_name: p.full_name,
            route: p.route,
            pickup_stop: p.pickup_stop,
            payment_status: p.payment_status,
          })),
      );
    } else {
      const kind = (MORNING_SLOTS as readonly string[]).includes(currentSlot)
        ? "morning"
        : "return";
      const { data: bookings } = await supabase
        .from("bookings")
        .select("student_id,route,pickup_stop")
        .eq("service_date", today)
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

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <Tabs value={slot} onValueChange={setSlot}>
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
              <Users className="me-1 size-3.5" /> {filteredRows.length} passenger
              {filteredRows.length === 1 ? "" : "s"}
            </Badge>
            {installmentCount > 0 && (
              <Badge className="bg-warning text-warning-foreground">
                🟡 {installmentCount} قسط
              </Badge>
            )}
            {slot === "04:00 PM" && (
              <span className="text-xs text-muted-foreground">
                All subscribed students not opted out today
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
          ) : (
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
                {filteredRows.map((r) => (
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
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
