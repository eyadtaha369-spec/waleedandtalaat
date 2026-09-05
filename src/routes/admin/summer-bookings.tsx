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

function SummerBookingsPage() {
  const [bookings, setBookings] = useState<ExamBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [stopFilter, setStopFilter] = useState<string>("all");

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
    window.open(link, "_blank", "noopener,noreferrer");
    toast.success(
      action === "confirmed"
        ? "تم التأكيد — WhatsApp مفتوح لإرسال رابط التصريح"
        : "تم الرفض — WhatsApp مفتوح لإرسال الإشعار",
    );
    void load();
  };

  const filtered = bookings.filter((b) => {
    if (dateFilter !== "all" && b.exam_date !== dateFilter) return false;
    if (stopFilter !== "all" && b.pickup_stop !== stopFilter) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">Summer Bookings / حجز الامتحانات</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> Back to console
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="all">All exam dates</option>
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
            <option value="all">All stops</option>
            {EXAM_STOPS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <Badge className="btn-gold">
            {filtered.length} request{filtered.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No requests match this view.</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Exam date</TableHead>
                <TableHead>Pickup stop &amp; time</TableHead>
                <TableHead>Companion / مرافق</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Actions</TableHead>
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
                        <span className="whitespace-nowrap">👥 طالب + مرافق (المستحق: 250 ج)</span>
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
                            View receipt
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-nowrap">👤 طالب فقط (مجاناً)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {b.status === "pending" && (
                      <Badge className="bg-warning text-warning-foreground">🟡 Pending</Badge>
                    )}
                    {b.status === "confirmed" && (
                      <Badge className="bg-success text-success-foreground">🟢 Accepted</Badge>
                    )}
                    {b.status === "rejected" && (
                      <Badge className="bg-destructive text-destructive-foreground">
                        🔴 Rejected
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
                          <Check className="size-4" /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === b.id}
                          onClick={() => void decide(b, "rejected")}
                        >
                          <X className="size-4" /> Reject
                        </Button>
                      </div>
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
