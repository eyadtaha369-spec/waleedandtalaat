import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, MessageCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
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
import { useSessionState, useUrlBackedState } from "@/hooks/usePersistentState";

const installmentsSearchSchema = z.object({
  route: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/admin/installments")({
  head: () => ({
    meta: [{ title: "Second installment collection — Waleed & Talaat" }],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    try {
      return installmentsSearchSchema.parse(search);
    } catch {
      return {};
    }
  },
  component: () => (
    <AdminGuard requireAdmin>
      <InstallmentsPage />
    </AdminGuard>
  ),
});

// Matches get_pending_second_installment_students()'s exact return
// shape — every row here is, by definition, still pending_second; the
// RPC itself already excludes anyone confirm_second_installment() has
// cleared, so there's no separate status to filter on anymore.
type Row = {
  student_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  amount_paid: number;
  remaining_balance: number;
};

function InstallmentsPage() {
  const { t } = useLanguage();

  const [rows, setRows] = useState<Row[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const setRouteFilter = (v: string) =>
    void navigate({ search: (p) => ({ ...p, route: v }), replace: true });
  const routeFilter = useUrlBackedState<string>(
    "installments.routeFilter",
    urlSearch.route,
    setRouteFilter,
    "all",
    { validate: (v): v is string => typeof v === "string" },
  );

  // Never in the URL — could contain a searched student name/phone.
  const [search, setSearch] = useSessionState<string>("installments.search", "", {
    validate: (v): v is string => typeof v === "string",
  });

  const load = async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("get_pending_second_installment_students");
    setLoadingList(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as Row[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  // Distinct routes actually present in the data, not the full route
  // list — a route with nobody pending shouldn't show up as a filter.
  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.route) set.add(r.route);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const routeSummary = useMemo(() => {
    const map = new Map<string, { count: number; remaining: number }>();
    for (const r of rows) {
      const key = r.route ?? t("manifests.noRouteAssigned");
      const entry = map.get(key) ?? { count: 0, remaining: 0 };
      entry.count += 1;
      entry.remaining += r.remaining_balance;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows, t]);

  const filtered = useMemo(() => {
    const q = search.trim();
    // "numeric" query (digits, spaces, +) is treated as a phone
    // fragment and matched digit-only; anything else matches the name.
    const isNumericQuery = q.length > 0 && /^[\d\s+]+$/.test(q);
    const qDigits = q.replace(/\D/g, "");
    const qLower = q.toLowerCase();
    return rows.filter((r) => {
      if (routeFilter !== "all" && r.route !== routeFilter) return false;
      if (!q) return true;
      if (isNumericQuery) return (r.phone ?? "").replace(/\D/g, "").includes(qDigits);
      return r.full_name.toLowerCase().includes(qLower);
    });
  }, [rows, routeFilter, search]);

  const totalRemaining = rows.reduce((sum, r) => sum + (r.remaining_balance || 0), 0);
  const totalPaid = rows.reduce((sum, r) => sum + (r.amount_paid || 0), 0);

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

  const handleConfirmClick = (row: Row) => {
    const message = `${t("installments.confirmPrefix")} ${row.full_name}${t("installments.confirmSuffix")}`;
    // An accidental tap must never remove a student from the list.
    if (!window.confirm(message)) return;
    void confirmPayment(row.student_id);
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
        <KpiCard label={t("installments.totalStudents")} value={String(rows.length)} />
        <KpiCard
          label={t("installments.outstanding")}
          value={`${totalRemaining.toLocaleString()} ج.م`}
          accent
        />
        <KpiCard
          label={t("installments.totalCollected")}
          value={`${totalPaid.toLocaleString()} ج.م`}
        />
      </div>

      {routeSummary.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {routeSummary.map(([route, s]) => {
            const active = routeFilter === route;
            return (
              <button
                key={route}
                type="button"
                onClick={() => setRouteFilter(active ? "all" : route)}
                className={`rounded-2xl border p-4 text-start transition-colors ${
                  active
                    ? "border-gilded bg-accent/5"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <p className="truncate text-sm font-semibold">{route}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.count} {t("installments.studentsUnit")}
                </p>
                <p className="text-xs text-muted-foreground">{s.remaining.toLocaleString()} ج.م</p>
              </button>
            );
          })}
        </div>
      )}

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
            {routeOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {t("installments.showingCount")} {filtered.length} {t("installments.ofCount")}{" "}
            {rows.length}
          </span>
        </div>

        {loadingList ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("installments.noStudentsMatch")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("installments.rowNumber")}</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead>{t("common.route")}</TableHead>
                  <TableHead>{t("installments.amountPaid")}</TableHead>
                  <TableHead>{t("installments.remainingBalance")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.student_id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.phone ?? "—"}</TableCell>
                    <TableCell>{r.route ?? "—"}</TableCell>
                    <TableCell>{r.amount_paid.toLocaleString()} ج.م</TableCell>
                    <TableCell>{r.remaining_balance.toLocaleString()} ج.م</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {r.phone && (
                          <a
                            href={installmentReminderLink({
                              full_name: r.full_name,
                              phone: r.phone,
                              route: r.route ?? "",
                              amount: r.remaining_balance,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline">
                              <MessageCircle className="size-4" /> {t("installments.remind")}
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          className="btn-gold"
                          disabled={busyId === r.student_id}
                          onClick={() => handleConfirmClick(r)}
                        >
                          <CheckCircle2 className="size-4" /> {t("installments.markPaid")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
