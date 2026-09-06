import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";

export const Route = createFileRoute("/admin/daily-passes")({
  head: () => ({ meta: [{ title: "Daily pass tracking — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <DailyPassesPage />
    </AdminGuard>
  ),
});

type PassRow = {
  full_name: string;
  phone: string;
  route: string;
  pickup_stop: string | null;
  slot: string;
  kind: string;
  payment_method: string;
  is_scanned: boolean;
  scanned_at: string | null;
  scanned_by_name: string | null;
  created_at: string;
};

function DailyPassesPage() {
  const { t, lang } = useLanguage();
  const [rows, setRows] = useState<PassRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("list_confirmed_daily_passes");
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setRows((data as PassRow[]) ?? []);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("dailyPasses.trackingTitle")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dailyPasses.noRecords")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("common.stop")}</TableHead>
                <TableHead>{t("dailyPasses.trip")}</TableHead>
                <TableHead>{t("dailyPass.paymentMethod")}</TableHead>
                <TableHead>{t("dailyPasses.scannedBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell>{r.route}</TableCell>
                  <TableCell>{r.pickup_stop ?? "—"}</TableCell>
                  <TableCell>
                    {formatSlotLabel(r.slot, lang)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({r.kind === "return" ? t("guestPass.returnLeg") : t("guestPass.morningLeg")})
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        r.payment_method === "instapay"
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {r.payment_method === "instapay"
                        ? t("dailyPass.instapay")
                        : t("dailyPass.cash")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.is_scanned ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <CheckCircle2 className="size-3.5 text-success" />{" "}
                        {r.scanned_by_name ?? "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("dailyPasses.notScannedYet")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
