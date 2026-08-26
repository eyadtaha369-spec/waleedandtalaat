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
};

export function ManifestsPanel() {
  const today = useMemo(() => toDateKey(cairoNow()), []);
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select("id,full_name,route,pickup_stop")
        .order("route");
      setRows(
        (profiles ?? [])
          .filter((p) => !excluded.has(p.id))
          .map((p) => ({
            student_id: p.id,
            full_name: p.full_name,
            route: p.route,
            pickup_stop: p.pickup_stop,
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
        ? await supabase.from("profiles").select("id,full_name").in("id", ids)
        : { data: [] };
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      setRows(
        (bookings ?? []).map((b) => ({
          student_id: b.student_id,
          full_name: nameById.get(b.student_id) ?? "—",
          route: b.route,
          pickup_stop: b.pickup_stop,
        })),
      );
    }
    setLoading(false);
  };

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
          <div className="mb-4 flex items-center gap-2">
            <Badge className="btn-gold">
              <Users className="me-1 size-3.5" /> {rows.length} passenger
              {rows.length === 1 ? "" : "s"}
            </Badge>
            {slot === "04:00 PM" && (
              <span className="text-xs text-muted-foreground">
                All subscribed students not opted out today
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading manifest…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passengers for this slot yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Stop</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.student_id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.route ?? "—"}</TableCell>
                    <TableCell>{r.pickup_stop ?? "—"}</TableCell>
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
