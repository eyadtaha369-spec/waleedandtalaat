import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, MessageCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRoutes } from "@/hooks/useRoutes";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { installmentReminderLink } from "@/lib/subscription";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";

export const Route = createFileRoute("/admin/installments")({
  head: () => ({
    meta: [{ title: "Installments — Waleed & Talaat" }],
  }),
  component: () => (
    <AdminGuard requireAdmin>
      <InstallmentsPage />
    </AdminGuard>
  ),
});

type Student = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  initial_amount_paid: number;
  second_installment_amount: number | null;
  payment_method: string | null;
  installment_status: "pending_second" | "completed";
};

type StatusFilter = "all" | "pending_second" | "completed";

function InstallmentsPage() {
  const { routes } = useRoutes();
  const { t } = useLanguage();

  const [students, setStudents] = useState<Student[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("list_installment_students");
    setLoadingList(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as Student[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (routeFilter !== "all" && s.route !== routeFilter) return false;
      if (statusFilter !== "all" && s.installment_status !== statusFilter) return false;
      if (q && !s.full_name.toLowerCase().includes(q) && !(s.phone ?? "").includes(q)) return false;
      return true;
    });
  }, [students, routeFilter, statusFilter, search]);

  const totalStudents = students.length;
  const totalCollected = students.reduce((sum, s) => sum + (s.initial_amount_paid || 0), 0);
  const totalOutstanding = students
    .filter((s) => s.installment_status === "pending_second")
    .reduce((sum, s) => sum + (s.second_installment_amount ?? s.initial_amount_paid ?? 0), 0);

  const confirmPayment = async (studentId: string) => {
    setBusyId(studentId);
    const { data, error } = await supabase.rpc("confirm_second_installment", {
      p_student_id: studentId,
    });
    setBusyId(null);
    if (error || (data as { error?: string })?.error) {
      toast.error(
        (data as { error?: string })?.error ??
          (await edgeFunctionErrorMessage(error, "Could not confirm payment")),
      );
      return;
    }
    toast.success(t("installments.secondConfirmed"));
    void load();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("admin.installmentsTitle")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label={t("installments.totalStudents")} value={String(totalStudents)} />
        <KpiCard
          label={t("installments.totalCollected")}
          value={`${totalCollected.toLocaleString()} ج.م`}
        />
        <KpiCard
          label={t("installments.outstanding")}
          value={`${totalOutstanding.toLocaleString()} ج.م`}
          accent
        />
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder={t("installments.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
          >
            <option value="all">{t("installments.allRoutes")}</option>
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">{t("common.all")}</option>
            <option value="pending_second">{t("installments.pendingSecond")}</option>
            <option value="completed">{t("installments.completed")}</option>
          </select>
        </div>

        {loadingList ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("installments.noStudentsMatch")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("installments.initialPaid")}</TableHead>
                <TableHead>{t("installments.method")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.route ?? "—"}</TableCell>
                  <TableCell>{s.initial_amount_paid.toLocaleString()} ج.م</TableCell>
                  <TableCell>{s.payment_method ?? "—"}</TableCell>
                  <TableCell>
                    {s.installment_status === "completed" ? (
                      <Badge className="bg-success text-success-foreground">
                        🟢 {t("installments.completed")}
                      </Badge>
                    ) : (
                      <Badge className="bg-warning text-warning-foreground">
                        🟡 {t("installments.pendingSecond")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {s.installment_status === "pending_second" && s.phone && (
                        <a
                          href={installmentReminderLink({
                            full_name: s.full_name,
                            phone: s.phone,
                            amount: s.second_installment_amount ?? s.initial_amount_paid,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            <MessageCircle className="size-4" /> {t("installments.remind")}
                          </Button>
                        </a>
                      )}
                      {s.installment_status === "pending_second" && (
                        <Button
                          size="sm"
                          className="btn-gold"
                          disabled={busyId === s.user_id}
                          onClick={() => void confirmPayment(s.user_id)}
                        >
                          <CheckCircle2 className="size-4" /> {t("installments.markPaid")}
                        </Button>
                      )}
                    </div>
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

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-gilded" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs tracking-widest text-muted-foreground uppercase">
        <Wallet className="size-3.5" /> {label}
      </div>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-gilded" : ""}`}>{value}</p>
    </div>
  );
}
