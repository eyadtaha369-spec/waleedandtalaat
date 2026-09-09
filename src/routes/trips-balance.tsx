import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
                    disabled={busyId === s.user_id || s.trips_remaining <= 0}
                    onClick={() => void applyDelta(s.user_id, -1)}
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
    </main>
  );
}
