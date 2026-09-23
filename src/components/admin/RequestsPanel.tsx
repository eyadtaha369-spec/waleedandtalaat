import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
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
import { cairoNow, prettyDate, toDateKey } from "@/lib/schedule";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { useLanguage } from "@/hooks/useLanguage";

type ApprovedPassRow = {
  id: string;
  full_name: string;
  phone: string;
  route: string;
  pickup_stop: string | null;
  trip_type: string;
  payment_method: string;
  amount: number;
  service_date: string;
  approved_by_name: string | null;
};

type Request = {
  id: string;
  full_name: string;
  phone: string;
  route: string;
  pickup_stop: string | null;
  slot: string;
  service_date: string;
  status: string;
  trip_type: string;
  return_slot: string | null;
  return_pickup_stop: string | null;
  payment_method: string;
  receipt_url: string | null;
};

export function RequestsPanel() {
  const { t, lang } = useLanguage();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("daily_pass_requests")
      .select(
        "id,full_name,phone,route,pickup_stop,slot,service_date,status,trip_type,return_slot,return_pickup_stop,payment_method,receipt_url",
      )
      .order("created_at", { ascending: false });
    setRequests((data as Request[]) ?? []);
    setLoading(false);
  };

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("daily-pass-receipts")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, action: "approved" | "rejected") => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("admin-daily-pass-action", {
      body: { request_id: id, action },
    });
    setBusyId(null);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, t("requests.updateError"))),
      );
      return;
    }
    void load();
    if (data.whatsapp_url) {
      // Opens WhatsApp Web/App with the chat and message pre-filled —
      // the admin reviews it and presses Send themselves.
      window.open(data.whatsapp_url, "_blank", "noopener,noreferrer");
    }
    toast.success(
      action === "approved" ? t("requests.approvedWhatsapp") : t("requests.rejectedWhatsapp"),
    );
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{t("requests.pendingRequests")}</h2>
          <Badge className="btn-gold">{pending.length}</Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("requests.noPending")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
              >
                <div className="flex-1">
                  <p className="font-semibold">{r.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.phone} · {r.route}
                    {r.pickup_stop ? ` · ${r.pickup_stop}` : ""} · {formatSlotLabel(r.slot, lang)} ·{" "}
                    {prettyDate(r.service_date)}
                  </p>
                  {r.trip_type === "round_trip" && r.return_slot && (
                    <p className="text-sm text-muted-foreground">
                      {t("dailyPass.roundTrip")}: {formatSlotLabel(r.return_slot, lang)}
                      {r.return_pickup_stop ? ` · ${r.return_pickup_stop}` : ""}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
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
                    {r.payment_method === "instapay" && r.receipt_url && (
                      <button
                        type="button"
                        onClick={() => void viewReceipt(r.receipt_url!)}
                        className="text-xs text-accent underline underline-offset-2"
                      >
                        {t("summer.viewReceipt")}
                      </button>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="btn-gold"
                  disabled={busyId === r.id}
                  onClick={() => void decide(r.id, "approved")}
                >
                  <Check className="size-4" /> {t("common.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => void decide(r.id, "rejected")}
                >
                  <X className="size-4" /> {t("common.reject")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ApprovedPassesRoster />
    </div>
  );
}

function ApprovedPassesRoster() {
  const { t } = useLanguage();
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [date, setDate] = useState(todayKey);
  const [rows, setRows] = useState<ApprovedPassRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.rpc("list_approved_daily_passes", { p_date: date });
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [date]);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("requests.approvedRoster")}</h2>
        <input
          type="date"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("requests.noApproved")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("common.stop")}</TableHead>
                <TableHead>{t("requests.passType")}</TableHead>
                <TableHead>{t("dailyPass.paymentMethod")}</TableHead>
                <TableHead>{t("requests.amount")}</TableHead>
                <TableHead>{t("manifests.date")}</TableHead>
                <TableHead>{t("requests.approvedBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell>{r.route}</TableCell>
                  <TableCell>{r.pickup_stop ?? "—"}</TableCell>
                  <TableCell>
                    {r.trip_type === "round_trip"
                      ? t("dailyPass.roundTrip")
                      : r.trip_type === "return_only"
                        ? t("dailyPass.returnOnly")
                        : t("dailyPass.oneWay")}
                  </TableCell>
                  <TableCell>
                    {r.payment_method === "instapay"
                      ? t("dailyPass.instapay")
                      : t("dailyPass.cash")}
                  </TableCell>
                  <TableCell>
                    {r.amount} {t("common.egp")}
                  </TableCell>
                  <TableCell>{prettyDate(r.service_date)}</TableCell>
                  <TableCell>{r.approved_by_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
