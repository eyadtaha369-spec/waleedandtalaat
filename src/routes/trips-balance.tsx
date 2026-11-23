import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/trips-balance")({
  head: () => ({ meta: [{ title: "70-Trips Balances — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <TripsBalancePage />
    </AdminGuard>
  ),
});

type PackageStudent = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  pickup_stop: string | null;
  photo_url: string | null;
  trips_remaining: number;
  trips_total: number;
};

function statusColor(remaining: number): string {
  if (remaining > 15) return "bg-success text-success-foreground";
  if (remaining >= 5) return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

type SetTotalUsedResult =
  | { error: string }
  | {
      warning: "already_deducted";
      current_used: number;
      trips_remaining: number;
      trips_total: number;
    }
  | {
      student_id: string;
      trips_remaining: number;
      trips_total: number;
      previous_used: number;
      delta: number;
    };

type DeductMode = "setTotal" | "amount";

function TripsBalancePage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes } = useRoutes();

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [students, setStudents] = useState<PackageStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addModalFor, setAddModalFor] = useState<PackageStudent | null>(null);
  const [addAmount, setAddAmount] = useState("1");
  const [addReason, setAddReason] = useState("");

  const [deductModalFor, setDeductModalFor] = useState<PackageStudent | null>(null);
  const [deductMode, setDeductMode] = useState<DeductMode>("setTotal");
  const [targetTotalUsed, setTargetTotalUsed] = useState("0");
  const [forceConfirmed, setForceConfirmed] = useState(false);
  const [deductAmount, setDeductAmount] = useState("1");
  const [deductReason, setDeductReason] = useState("");

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_route_package_students", {
      p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as PackageStudent[]) ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoute]);

  const applyDelta = async (studentId: string, delta: number, reason?: string) => {
    setBusyId(studentId);
    const { data, error } = await supabase.rpc("adjust_student_trips", {
      p_student_id: studentId,
      p_delta: delta,
      p_reason: reason || null,
    });
    setBusyId(null);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not update");
      return;
    }
    const result = data as { trips_remaining: number; trips_total: number };
    setStudents((prev) =>
      prev.map((s) =>
        s.user_id === studentId
          ? { ...s, trips_remaining: result.trips_remaining, trips_total: result.trips_total }
          : s,
      ),
    );
    toast.success(t("tripsBalance.updated"));
  };

  const openAddModal = (s: PackageStudent) => {
    setAddModalFor(s);
    setAddAmount("1");
    setAddReason("");
  };

  const confirmAdd = async () => {
    if (!addModalFor) return;
    const amount = Number(addAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error(t("tripsBalance.amount"));
      return;
    }
    await applyDelta(addModalFor.user_id, amount, addReason.trim() || undefined);
    setAddModalFor(null);
  };

  const liveDeductStudent = deductModalFor
    ? (students.find((s) => s.user_id === deductModalFor.user_id) ?? deductModalFor)
    : null;
  const currentUsed = liveDeductStudent
    ? liveDeductStudent.trips_total - liveDeductStudent.trips_remaining
    : 0;

  const openDeductModal = (s: PackageStudent) => {
    setDeductModalFor(s);
    setDeductMode("setTotal");
    setTargetTotalUsed(String(s.trips_total - s.trips_remaining));
    setForceConfirmed(false);
    setDeductAmount("1");
    setDeductReason("");
  };

  const targetNum = Number(targetTotalUsed);
  const isValidTarget =
    targetTotalUsed.trim() !== "" &&
    Number.isInteger(targetNum) &&
    targetNum >= 0 &&
    !!liveDeductStudent &&
    targetNum <= liveDeductStudent.trips_total;
  const isAlreadyDeducted = isValidTarget && targetNum <= currentUsed;

  const amountNum = Number(deductAmount);
  const isValidAmount =
    deductAmount.trim() !== "" &&
    Number.isInteger(amountNum) &&
    amountNum >= 1 &&
    !!liveDeductStudent &&
    amountNum <= liveDeductStudent.trips_remaining;

  const confirmSetTotal = async () => {
    if (!liveDeductStudent || !isValidTarget) return;
    if (isAlreadyDeducted && !forceConfirmed) return;
    setBusyId(liveDeductStudent.user_id);
    const { data, error } = await supabase.rpc("set_student_total_used", {
      p_student_id: liveDeductStudent.user_id,
      p_target_total_used: targetNum,
      p_force: isAlreadyDeducted ? forceConfirmed : false,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as SetTotalUsedResult;
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if ("warning" in result) {
      // Race: someone else changed the balance between the keystroke and
      // the click. Refresh this row's numbers from the server's own
      // authoritative figures and let the (now up to date) warning +
      // checkbox UI take over instead of failing silently.
      setStudents((prev) =>
        prev.map((s) =>
          s.user_id === liveDeductStudent.user_id
            ? { ...s, trips_remaining: result.trips_remaining, trips_total: result.trips_total }
            : s,
        ),
      );
      return;
    }
    setStudents((prev) =>
      prev.map((s) =>
        s.user_id === result.student_id
          ? { ...s, trips_remaining: result.trips_remaining, trips_total: result.trips_total }
          : s,
      ),
    );
    toast.success(
      `${t("tripsBalance.setTotalSuccessPrefix")} ${targetNum} ${t("tripsBalance.setTotalSuccessSuffix")}`,
    );
    setDeductModalFor(null);
  };

  const confirmDeductAmount = async () => {
    if (!liveDeductStudent || !isValidAmount) return;
    await applyDelta(liveDeductStudent.user_id, -amountNum, deductReason.trim() || undefined);
    setDeductModalFor(null);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("tripsBalance.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
            >
              <option value="all">{t("students.allRoutes")}</option>
              {routes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <Badge className="btn-gold">{profile?.assigned_route ?? "—"}</Badge>
          )}
          <Badge className="ms-auto bg-muted text-muted-foreground">{students.length}</Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : students.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("tripsBalance.noStudents")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {students.map((s) => (
              <div
                key={s.user_id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
              >
                <div className="size-12 shrink-0 overflow-hidden rounded-full">
                  <SmartAvatar photoUrl={s.photo_url} name={s.full_name} className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.phone ?? "—"} · {s.pickup_stop ?? "—"}
                    {isAdmin && routeFilter === "all" && ` · ${s.route ?? "—"}`}
                  </p>
                </div>
                <Badge className={statusColor(s.trips_remaining)}>
                  {t("tripsBalance.remaining")}: {s.trips_remaining} {t("tripsBalance.of")}{" "}
                  {s.trips_total} {t("tripsBalance.trip")}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === s.user_id}
                    onClick={() => openDeductModal(s)}
                  >
                    <Minus className="size-4" /> {t("tripsBalance.deduct")}
                  </Button>
                  <Button
                    size="sm"
                    className="btn-gold"
                    disabled={busyId === s.user_id}
                    onClick={() => openAddModal(s)}
                  >
                    <Plus className="size-4" /> {t("tripsBalance.addTrips")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!addModalFor} onOpenChange={(o) => !o && setAddModalFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("tripsBalance.addModalTitle")} — {addModalFor?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("tripsBalance.amount")}</Label>
              <Input
                type="number"
                min={1}
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tripsBalance.reason")}</Label>
              <Input
                placeholder={t("tripsBalance.reasonPlaceholder")}
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="btn-gold w-full"
              disabled={busyId === addModalFor?.user_id}
              onClick={() => void confirmAdd()}
            >
              {t("tripsBalance.confirmAdd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deductModalFor} onOpenChange={(o) => !o && setDeductModalFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("tripsBalance.deductModalTitle")} — {deductModalFor?.full_name}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDeductMode("setTotal")}
              className={`rounded-md border px-3 py-2 text-sm ${
                deductMode === "setTotal"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-input bg-background"
              }`}
            >
              {t("tripsBalance.modeSetTotal")}
            </button>
            <button
              type="button"
              onClick={() => setDeductMode("amount")}
              className={`rounded-md border px-3 py-2 text-sm ${
                deductMode === "amount"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-input bg-background"
              }`}
            >
              {t("tripsBalance.modeAmount")}
            </button>
          </div>

          {liveDeductStudent && deductMode === "setTotal" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("tripsBalance.targetLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={liveDeductStudent.trips_total}
                  value={targetTotalUsed}
                  onChange={(e) => {
                    setTargetTotalUsed(e.target.value);
                    setForceConfirmed(false);
                  }}
                />
                {!isValidTarget && (
                  <p className="text-xs text-destructive">{t("tripsBalance.invalidTargetRange")}</p>
                )}
              </div>

              <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3 text-sm">
                <p>
                  {t("tripsBalance.previewPackage")}: {liveDeductStudent.trips_total}{" "}
                  {t("tripsBalance.trip")}
                </p>
                <p>
                  {t("tripsBalance.previewCurrentUsed")}: {currentUsed} —{" "}
                  {t("tripsBalance.previewCurrentRemaining")}: {liveDeductStudent.trips_remaining}
                </p>
                <p>
                  {t("tripsBalance.previewTargetEntered")}: {isValidTarget ? targetNum : "—"}
                </p>
                <p>
                  {t("tripsBalance.previewDeltaNow")}:{" "}
                  {isValidTarget ? targetNum - currentUsed : "—"}
                </p>
                <p>
                  {t("tripsBalance.previewNewRemaining")}:{" "}
                  {isValidTarget ? liveDeductStudent.trips_total - targetNum : "—"}
                </p>
              </div>

              {isAlreadyDeducted && (
                <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/15 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-warning-foreground">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t("tripsBalance.alreadyDeductedPrefix")} {currentUsed}{" "}
                    {t("tripsBalance.alreadyDeductedSuffix")}
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={forceConfirmed}
                      onCheckedChange={(v) => setForceConfirmed(v === true)}
                    />
                    {t("tripsBalance.forceCheckboxLabel")}
                  </label>
                </div>
              )}

              <Button
                className="btn-gold w-full"
                disabled={
                  busyId === liveDeductStudent.user_id ||
                  !isValidTarget ||
                  (isAlreadyDeducted && !forceConfirmed)
                }
                onClick={() => void confirmSetTotal()}
              >
                {t("tripsBalance.confirmSetTotal")}
              </Button>
            </div>
          )}

          {liveDeductStudent && deductMode === "amount" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("tripsBalance.amount")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={liveDeductStudent.trips_remaining}
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("tripsBalance.reason")}</Label>
                <Input
                  placeholder={t("tripsBalance.reasonPlaceholder")}
                  value={deductReason}
                  onChange={(e) => setDeductReason(e.target.value)}
                />
              </div>

              <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3 text-sm">
                <p>
                  {t("tripsBalance.previewRemainingNow")}: {liveDeductStudent.trips_remaining}
                </p>
                <p>
                  {t("tripsBalance.previewRemainingAfter")}:{" "}
                  {isValidAmount ? liveDeductStudent.trips_remaining - amountNum : "—"}
                </p>
              </div>

              <Button
                className="w-full"
                variant="destructive"
                disabled={busyId === liveDeductStudent.user_id || !isValidAmount}
                onClick={() => void confirmDeductAmount()}
              >
                {t("tripsBalance.confirmDeductAmount")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
