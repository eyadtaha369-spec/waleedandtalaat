import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bus, Download } from "lucide-react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { withUtf8Bom } from "@/lib/csvExport";
import { useLanguage } from "@/hooks/useLanguage";
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
  const { t } = useLanguage();
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("fleet-manifests", { body: {} });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, t("fleet.loadError"))));
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
    const blob = new Blob([withUtf8Bom(csv)], { type: "text/csv;charset=utf-8;" });
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
          <h2 className="font-semibold">{t("fleet.title")}</h2>
        </div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="size-4" /> {t("fleet.exportCsv")}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("fleet.formula")}</p>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("fleet.noActivity")}</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.route")}</TableHead>
              <TableHead>{t("fleet.morningScans")}</TableHead>
              <TableHead>{t("fleet.earlyReturn")}</TableHead>
              <TableHead>{t("fleet.optedOut")}</TableHead>
              <TableHead>{t("fleet.remaining4pm")}</TableHead>
              <TableHead>{t("fleet.bus")}</TableHead>
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
