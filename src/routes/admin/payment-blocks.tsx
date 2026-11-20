import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSessionState, useUrlBackedState } from "@/hooks/usePersistentState";

const paymentBlocksSearchSchema = z.object({
  route: z.string().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/admin/payment-blocks")({
  head: () => ({
    meta: [{ title: "Payment blocks — Waleed & Talaat" }],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    try {
      return paymentBlocksSearchSchema.parse(search);
    } catch {
      return {};
    }
  },
  component: () => (
    <AdminGuard requireAdmin>
      <PaymentBlocksPage />
    </AdminGuard>
  ),
});

// Matches list_payment_blocks()'s exact return shape (blocked first).
type Row = {
  student_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  is_blocked: boolean;
  reason: string;
  note: string | null;
  blocked_at: string;
  unblocked_at: string | null;
  unblock_count: number;
};

// Matches search_students_for_block()'s exact return shape.
type SearchRow = {
  student_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  is_blocked: boolean;
};

function PaymentBlocksPage() {
  const { t } = useLanguage();

  const [rows, setRows] = useState<Row[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const setRouteFilterUrl = (v: string) =>
    void navigate({ search: (p) => ({ ...p, route: v }), replace: true });
  const routeFilter = useUrlBackedState<string>(
    "paymentBlocks.routeFilter",
    urlSearch.route,
    setRouteFilterUrl,
    "all",
    { validate: (v): v is string => typeof v === "string" },
  );

  const setStatusFilterUrl = (v: string) =>
    void navigate({ search: (p) => ({ ...p, status: v }), replace: true });
  const statusFilterRaw = useUrlBackedState<string>(
    "paymentBlocks.statusFilter",
    urlSearch.status,
    setStatusFilterUrl,
    "all",
    { validate: (v): v is string => typeof v === "string" },
  );
  const statusFilter =
    statusFilterRaw === "blocked" || statusFilterRaw === "unblocked" ? statusFilterRaw : "all";

  // Never in the URL — could contain a searched student name/phone.
  const [search, setSearch] = useSessionState<string>("paymentBlocks.search", "", {
    validate: (v): v is string => typeof v === "string",
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchRow[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addNote, setAddNote] = useState("");
  const [addBusyId, setAddBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("list_payment_blocks");
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

  // Debounced search inside the add dialog — min 2 characters, same as
  // search_students_for_block()'s own floor.
  useEffect(() => {
    if (!addOpen) return;
    const q = addQuery.trim();
    if (q.length < 2) {
      setAddResults([]);
      setAddSearching(false);
      return;
    }
    setAddSearching(true);
    const timer = setTimeout(() => {
      void supabase.rpc("search_students_for_block", { p_query: q }).then(({ data, error }) => {
        setAddSearching(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        setAddResults((data as SearchRow[]) ?? []);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [addQuery, addOpen]);

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.route) set.add(r.route);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const isNumericQuery = q.length > 0 && /^[\d\s+]+$/.test(q);
    const qDigits = q.replace(/\D/g, "");
    const qLower = q.toLowerCase();
    return rows.filter((r) => {
      if (routeFilter !== "all" && r.route !== routeFilter) return false;
      if (statusFilter === "blocked" && !r.is_blocked) return false;
      if (statusFilter === "unblocked" && r.is_blocked) return false;
      if (!q) return true;
      if (isNumericQuery) return (r.phone ?? "").replace(/\D/g, "").includes(qDigits);
      return r.full_name.toLowerCase().includes(qLower);
    });
  }, [rows, routeFilter, statusFilter, search]);

  const blockedCount = rows.filter((r) => r.is_blocked).length;
  const unblockedCount = rows.length - blockedCount;

  const setBlock = async (studentId: string, blocked: boolean, note?: string | null) => {
    setBusyId(studentId);
    const { data, error } = await supabase.rpc("set_payment_block", {
      p_student_id: studentId,
      p_blocked: blocked,
      p_note: note ?? null,
    });
    setBusyId(null);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(
        (data as { error?: string } | null)?.error ?? error?.message ?? t("scanner.scanFailed"),
      );
      return;
    }
    toast.success(blocked ? t("paymentBlocks.reBlockedToast") : t("paymentBlocks.unblockedToast"));
    void load();
  };

  const handleUnblockClick = (row: Row) => {
    const message = `${t("paymentBlocks.confirmUnblockPrefix")} ${row.full_name}${t("paymentBlocks.confirmSuffix")}`;
    if (!window.confirm(message)) return;
    void setBlock(row.student_id, false);
  };

  const handleReBlockClick = (row: Row) => {
    const message = `${t("paymentBlocks.confirmReBlockPrefix")} ${row.full_name}${t("paymentBlocks.confirmSuffix")}`;
    if (!window.confirm(message)) return;
    void setBlock(row.student_id, true);
  };

  const handleAddBlock = async (studentId: string) => {
    setAddBusyId(studentId);
    const { data, error } = await supabase.rpc("set_payment_block", {
      p_student_id: studentId,
      p_blocked: true,
      p_note: addNote.trim() || null,
    });
    setAddBusyId(null);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(
        (data as { error?: string } | null)?.error ?? error?.message ?? t("scanner.scanFailed"),
      );
      return;
    }
    toast.success(t("paymentBlocks.addedToast"));
    setAddResults((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, is_blocked: true } : r)),
    );
    void load();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("admin.paymentBlocksTitle")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <KpiCard label={t("paymentBlocks.blockedNow")} value={String(blockedCount)} accent />
        <KpiCard label={t("paymentBlocks.paidAndActive")} value={String(unblockedCount)} />
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
            onChange={(e) => setRouteFilterUrl(e.target.value)}
          >
            <option value="all">{t("installments.allRoutes")}</option>
            {routeOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilterUrl(e.target.value)}
          >
            <option value="all">{t("paymentBlocks.allStatuses")}</option>
            <option value="blocked">{t("paymentBlocks.statusBlocked")}</option>
            <option value="unblocked">{t("paymentBlocks.statusUnblocked")}</option>
          </select>
          <Button
            className="btn-gold ms-auto"
            onClick={() => {
              setAddOpen(true);
              setAddQuery("");
              setAddResults([]);
              setAddNote("");
            }}
          >
            <Plus className="size-4" /> {t("paymentBlocks.addButton")}
          </Button>
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
                  <TableHead>{t("paymentBlocks.status")}</TableHead>
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
                    <TableCell>
                      <div title={r.note ?? undefined}>
                        {r.is_blocked ? (
                          <Badge className="bg-destructive text-destructive-foreground">
                            {t("paymentBlocks.statusBlocked")}
                          </Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">
                            {t("paymentBlocks.statusUnblocked")}
                          </Badge>
                        )}
                        {!r.is_blocked && r.unblock_count > 0 && r.unblocked_at && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {t("paymentBlocks.unblockedOn")}{" "}
                            {new Date(r.unblocked_at).toLocaleDateString("en-GB")}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">
                      {r.is_blocked ? (
                        <Button
                          size="sm"
                          className="btn-gold"
                          disabled={busyId === r.student_id}
                          onClick={() => handleUnblockClick(r)}
                        >
                          <CheckCircle2 className="size-4" />{" "}
                          {t("paymentBlocks.confirmPaymentButton")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.student_id}
                          onClick={() => handleReBlockClick(r)}
                        >
                          <Ban className="size-4" /> {t("paymentBlocks.reBlockButton")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("paymentBlocks.addDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("paymentBlocks.addSearchPlaceholder")}
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                className="ps-9"
              />
            </div>
            <Input
              placeholder={t("paymentBlocks.addNotePlaceholder")}
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
            />
            {addSearching ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : addQuery.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground">{t("paymentBlocks.addSearchHint")}</p>
            ) : addResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("installments.noStudentsMatch")}</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {addResults.map((r) => (
                  <li
                    key={r.student_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {r.full_name}
                        {r.is_blocked && (
                          <Badge className="bg-destructive text-destructive-foreground">
                            {t("paymentBlocks.statusBlocked")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.phone ?? "—"} · {r.route ?? "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="btn-gold"
                      disabled={r.is_blocked || addBusyId === r.student_id}
                      onClick={() => void handleAddBlock(r.student_id)}
                    >
                      {t("paymentBlocks.addBlockAction")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-gilded" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs tracking-widest text-muted-foreground uppercase">
        <Ban className="size-3.5" /> {label}
      </div>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-gilded" : ""}`}>{value}</p>
    </div>
  );
}
