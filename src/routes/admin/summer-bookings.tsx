import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGuard } from "@/components/admin/AdminGuard";
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
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { useLanguage } from "@/hooks/useLanguage";
import {
  EXAM_DATES,
  EXAM_STOPS,
  examDateLabel,
  examConfirmationLink,
  examRejectionLink,
} from "@/lib/examBooking";

export const Route = createFileRoute("/admin/summer-bookings")({
  head: () => ({ meta: [{ title: "Summer bookings — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <SummerBookingsPage />
    </AdminGuard>
  ),
});

type ExamBooking = {
  id: string;
  full_name: string;
  phone: string;
  exam_date: string;
  pickup_stop: string;
  pickup_time: string;
  status: "pending" | "confirmed" | "rejected";
  pass_token: string | null;
  has_companion: boolean;
  companion_name: string | null;
  companion_relation: string | null;
  receipt_url: string | null;
};

const SITE_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

type StatusFilter = "not_rejected" | "all" | "pending" | "confirmed" | "rejected";

function SummerBookingsPage() {
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<ExamBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [stopFilter, setStopFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("not_rejected");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exam_bookings")
      .select(
        "id,full_name,phone,exam_date,pickup_stop,pickup_time,status,pass_token,has_companion,companion_name,companion_relation,receipt_url",
      )
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBookings((data as ExamBooking[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("exam-receipts")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const decide = async (booking: ExamBooking, action: "confirmed" | "rejected") => {
    setBusyId(booking.id);
    const { data, error } = await supabase.rpc("decide_exam_booking", {
      p_id: booking.id,
      p_action: action,
    });
    setBusyId(null);
    if (error || (data as { error?: string })?.error) {
      toast.error(
        (data as { error?: string })?.error ??
          (await edgeFunctionErrorMessage(error, "Could not update request")),
      );
      return;
    }
    const result = data as {
      full_name: string;
      phone: string;
      exam_date: string;
      pickup_stop: string;
      pickup_time: string;
      pass_token: string | null;
    };
    const link =
      action === "confirmed"
        ? examConfirmationLink({
            full_name: result.full_name,
            phone: result.phone,
            examDateLabel: examDateLabel(result.exam_date),
            pickupStop: result.pickup_stop,
            pickupTime: result.pickup_time,
            passUrl: `${SITE_ORIGIN}/exam-pass/${result.pass_token}`,
          })
        : examRejectionLink({
            full_name: result.full_name,
            phone: result.phone,
            examDateLabel: examDateLabel(result.exam_date),
          });
    // Never window.open() after an async call on its own — mobile
    // Safari/Chrome treat that as an unsolicited popup and block it.
    // Instead, surface an explicit button; clicking it is a fresh,
    // synchronous user gesture that popup blockers always allow.
    toast(action === "confirmed" ? t("summer.whatsappConfirmed") : t("summer.whatsappRejected"), {
      action: {
        label: t("summer.openWhatsapp"),
        onClick: () => window.open(link, "_blank", "noopener,noreferrer"),
      },
      duration: 20000,
    });
    void load();
  };

  const resendQr = (b: ExamBooking) => {
    if (!b.pass_token) return;
    const link = examConfirmationLink({
      full_name: b.full_name,
      phone: b.phone,
      examDateLabel: examDateLabel(b.exam_date),
      pickupStop: b.pickup_stop,
      pickupTime: b.pickup_time,
      passUrl: `${SITE_ORIGIN}/exam-pass/${b.pass_token}`,
    });
    // Direct click handler, no async work first — safe to open right away.
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const dateAndStopMatched = bookings.filter((b) => {
    if (dateFilter !== "all" && b.exam_date !== dateFilter) return false;
    if (stopFilter !== "all" && b.pickup_stop !== stopFilter) return false;
    return true;
  });

  const filtered = dateAndStopMatched.filter((b) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "not_rejected") return b.status !== "rejected";
    return b.status === statusFilter;
  });

  const acceptedCount = dateAndStopMatched.filter((b) => b.status === "confirmed").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("summer.title")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="all">{t("summer.allDates")}</option>
            {EXAM_DATES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={stopFilter}
            onChange={(e) => setStopFilter(e.target.value)}
          >
            <option value="all">{t("summer.allStops")}</option>
            {EXAM_STOPS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="not_rejected">{t("summer.hideRejected")}</option>
            <option value="all">{t("summer.allStatuses")}</option>
            <option value="pending">{t("summer.pendingOnly")}</option>
            <option value="confirmed">{t("summer.acceptedOnly")}</option>
            <option value="rejected">{t("summer.rejectedOnly")}</option>
          </select>
          <Badge className="btn-gold">
            {filtered.length} {t("summer.shown")}
          </Badge>
          <Badge className="bg-success text-success-foreground">
            🟢 {acceptedCount} {t("summer.accepted")}
            {dateFilter !== "all"
              ? ` ${t("summer.acceptedOnDate")} ${examDateLabel(dateFilter)}`
              : ""}
          </Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("summer.noRequests")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("summer.examDate")}</TableHead>
                <TableHead>{t("summer.pickupStopTime")}</TableHead>
                <TableHead>{t("summer.companion")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{b.phone}</TableCell>
                  <TableCell>{examDateLabel(b.exam_date)}</TableCell>
                  <TableCell>
                    {b.pickup_stop} · {b.pickup_time}
                  </TableCell>
                  <TableCell>
                    {b.has_companion ? (
                      <div>
                        <span className="whitespace-nowrap">
                          {t("summer.studentPlusCompanion")}
                        </span>
                        {b.companion_name && (
                          <p className="text-xs text-muted-foreground">
                            {b.companion_name} · {b.companion_relation}
                          </p>
                        )}
                        {b.receipt_url && (
                          <button
                            type="button"
                            onClick={() => void viewReceipt(b.receipt_url!)}
                            className="text-xs text-accent underline underline-offset-2"
                          >
                            {t("summer.viewReceipt")}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-nowrap">{t("summer.studentOnly")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {b.status === "pending" && (
                      <Badge className="bg-warning text-warning-foreground">
                        🟡 {t("summer.pending")}
                      </Badge>
                    )}
                    {b.status === "confirmed" && (
                      <Badge className="bg-success text-success-foreground">
                        🟢 {t("summer.accepted")}
                      </Badge>
                    )}
                    {b.status === "rejected" && (
                      <Badge className="bg-destructive text-destructive-foreground">
                        🔴 {t("summer.rejected")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    {b.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          className="btn-gold"
                          disabled={busyId === b.id}
                          onClick={() => void decide(b, "confirmed")}
                        >
                          <Check className="size-4" /> {t("common.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === b.id}
                          onClick={() => void decide(b, "rejected")}
                        >
                          <X className="size-4" /> {t("common.reject")}
                        </Button>
                      </div>
                    )}
                    {b.status === "confirmed" && (
                      <Button
                        size="sm"
                        className="bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => resendQr(b)}
                      >
                        {t("summer.resendQr")}
                      </Button>
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
