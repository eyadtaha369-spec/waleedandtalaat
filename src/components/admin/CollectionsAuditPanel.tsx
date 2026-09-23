import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { cairoNow, toDateKey } from "@/lib/schedule";
import { useLanguage } from "@/hooks/useLanguage";

type SummaryRow = {
  route: string;
  collected_by_name: string;
  cash_total: number;
  instapay_total: number;
  grand_total: number;
};
type CollectionRow = {
  id: string;
  student_name: string;
  amount: number;
  payment_method: string;
  receipt_url: string | null;
  route: string;
  collected_by_name: string | null;
  collected_at: string;
};

export function CollectionsAuditPanel() {
  const { t } = useLanguage();
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [date, setDate] = useState(todayKey);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.rpc("get_collections_summary", { p_date: date }),
        supabase.rpc("list_collections", { p_date: date }),
      ]);
      setSummary(s ?? []);
      setRows(r ?? []);
      setLoading(false);
    })();
  }, [date]);

  const cashTotal = summary.reduce((sum, r) => sum + r.cash_total, 0);
  const instapayTotal = summary.reduce((sum, r) => sum + r.instapay_total, 0);

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("collection-receipts")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Badge className="bg-muted text-muted-foreground">
          {t("collections.totalCashToday")}: {cashTotal} {t("common.egp")}
        </Badge>
        <Badge className="bg-accent text-accent-foreground">
          {t("collections.totalInstapayToday")}: {instapayTotal} {t("common.egp")}
        </Badge>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">{t("collections.perRouteSummary")}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : summary.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("collections.noneToday")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.route")}</TableHead>
                  <TableHead>{t("collections.supervisor")}</TableHead>
                  <TableHead>{t("dailyPass.cash")}</TableHead>
                  <TableHead>{t("dailyPass.instapay")}</TableHead>
                  <TableHead>{t("requests.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.route}</TableCell>
                    <TableCell>{r.collected_by_name}</TableCell>
                    <TableCell>{r.cash_total}</TableCell>
                    <TableCell>{r.instapay_total}</TableCell>
                    <TableCell className="font-semibold">{r.grand_total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">{t("collections.allSubmissions")}</h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("collections.noneToday")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("collections.studentName")}</TableHead>
                  <TableHead>{t("common.route")}</TableHead>
                  <TableHead>{t("collections.supervisor")}</TableHead>
                  <TableHead>{t("dailyPass.paymentMethod")}</TableHead>
                  <TableHead>{t("requests.amount")}</TableHead>
                  <TableHead>{t("collections.receipt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell>{r.route}</TableCell>
                    <TableCell>{r.collected_by_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.payment_method === "instapay"
                        ? t("dailyPass.instapay")
                        : t("dailyPass.cash")}
                    </TableCell>
                    <TableCell>{r.amount}</TableCell>
                    <TableCell>
                      {r.receipt_url ? (
                        <button
                          type="button"
                          onClick={() => void viewReceipt(r.receipt_url!)}
                          className="text-xs text-accent underline underline-offset-2"
                        >
                          {t("summer.viewReceipt")}
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
