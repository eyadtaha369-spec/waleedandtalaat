import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bus, Download } from "lucide-react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FleetRow = {
  route: string;
  morning_scans: number;
  early_return_passengers: number;
  opted_out_count: number;
  remaining_for_4pm: number;
  recommended_bus: string;
};

export function FleetPanel() {
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("fleet-manifests", { body: {} });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Could not load fleet report");
      return;
    }
    setRows((data?.routes as FleetRow[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const downloadCsv = () => {
    const csv = Papa.unparse(
      rows.map((r) => ({
        Route: r.route,
        "Morning scans": r.morning_scans,
        "Early return passengers": r.early_return_passengers,
        "Opted out": r.opted_out_count,
        "Remaining for 4PM": r.remaining_for_4pm,
        "Recommended bus": r.recommended_bus,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "fleet-allocation.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bus className="text-accent size-5" />
          <h2 className="font-semibold">Fleet allocation — today</h2>
        </div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Remaining for 4PM = morning scans − early return passengers (12:30/1:30/2:30) − opt-outs.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No scan activity yet today.</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Morning scans</TableHead>
              <TableHead>Early return</TableHead>
              <TableHead>Opted out</TableHead>
              <TableHead>Remaining 4PM</TableHead>
              <TableHead>Bus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.route}>
                <TableCell className="font-medium">{r.route}</TableCell>
                <TableCell>{r.morning_scans}</TableCell>
                <TableCell>{r.early_return_passengers}</TableCell>
                <TableCell>{r.opted_out_count}</TableCell>
                <TableCell>{r.remaining_for_4pm}</TableCell>
                <TableCell>
                  <Badge className="btn-gold">{r.recommended_bus}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
