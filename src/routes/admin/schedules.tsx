import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";

export const Route = createFileRoute("/admin/schedules")({
  head: () => ({ meta: [{ title: "Bus Schedules — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <SchedulesPage />
    </AdminGuard>
  ),
});

type ScheduleSlot = {
  id: string;
  route_name: string;
  time_slot: string;
  kind: "morning" | "return";
  is_active: boolean;
  display_order: number;
};

function SchedulesPage() {
  const { isAdmin, profile } = useAuth();
  const { t, lang } = useLanguage();
  const { routes } = useRoutes();

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTime, setNewTime] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);
  const [windowBusy, setWindowBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("booking_window_closed")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setWindowClosed(!!data?.booking_window_closed));
  }, []);

  const toggleMasterWindow = async () => {
    const next = !windowClosed;
    if (next && !window.confirm(t("schedules.confirmCloseWindow"))) return;
    setWindowBusy(true);
    const { error } = await supabase.rpc("set_booking_window_closed", { p_closed: next });
    setWindowBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWindowClosed(next);
    toast.success(next ? t("schedules.windowClosedToast") : t("schedules.windowOpenedToast"));
  };

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_bus_schedules", {
      p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSlots((data as ScheduleSlot[]) ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoute]);

  const toggle = async (slot: ScheduleSlot) => {
    setBusyId(slot.id);
    const { error } = await supabase.rpc("toggle_bus_schedule", {
      p_id: slot.id,
      p_is_active: !slot.is_active,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, is_active: !s.is_active } : s)));
  };

  const remove = async (slot: ScheduleSlot) => {
    if (!window.confirm(t("schedules.confirmDelete"))) return;
    setBusyId(slot.id);
    const { error } = await supabase.rpc("delete_bus_schedule", { p_id: slot.id });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
  };

  const addSlot = async (route: string, kind: "morning" | "return") => {
    const key = `${route}-${kind}`;
    const time = (newTime[key] ?? "").trim();
    if (!time) {
      toast.error(t("schedules.enterTime"));
      return;
    }
    const { data, error } = await supabase.rpc("upsert_bus_schedule", {
      p_route: route,
      p_time_slot: time,
      p_kind: kind,
      p_id: null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSlots((prev) => [
      ...prev,
      {
        id: data as string,
        route_name: route,
        time_slot: time,
        kind,
        is_active: true,
        display_order: 99,
      },
    ]);
    setNewTime((prev) => ({ ...prev, [key]: "" }));
  };

  // Group by route, then kind.
  const routeNames = [...new Set(slots.map((s) => s.route_name))];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("schedules.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div
        className={`mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 p-6 ${
          windowClosed
            ? "border-destructive/60 bg-destructive/10"
            : "border-success/60 bg-success/10"
        }`}
      >
        <div>
          <p className="font-semibold">{t("schedules.masterToggleTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {windowClosed ? t("schedules.masterClosedDesc") : t("schedules.masterOpenDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            className={
              windowClosed
                ? "bg-destructive text-destructive-foreground"
                : "bg-success text-success-foreground"
            }
          >
            {windowClosed ? t("schedules.closed") : t("schedules.open")}
          </Badge>
          <Switch
            checked={!windowClosed}
            disabled={windowBusy}
            onCheckedChange={() => void toggleMasterWindow()}
          />
        </div>
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
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {routeNames.map((route) => (
              <div key={route} className="rounded-2xl border border-border p-4">
                <p className="font-semibold">{route}</p>
                {(["morning", "return"] as const).map((kind) => {
                  const kindSlots = slots
                    .filter((s) => s.route_name === route && s.kind === kind)
                    .sort((a, b) => a.display_order - b.display_order);
                  const key = `${route}-${kind}`;
                  return (
                    <div key={kind} className="mt-3">
                      <p className="text-xs tracking-widest text-muted-foreground uppercase">
                        {kind === "morning"
                          ? t("dashboard.morningDeparture")
                          : t("dashboard.earlyReturn")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {kindSlots.map((s) => (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                              s.is_active
                                ? "border-border"
                                : "border-dashed border-muted opacity-60"
                            }`}
                          >
                            <span className="text-sm">{formatSlotLabel(s.time_slot, lang)}</span>
                            <Switch
                              checked={s.is_active}
                              disabled={busyId === s.id}
                              onCheckedChange={() => void toggle(s)}
                            />
                            <button
                              type="button"
                              disabled={busyId === s.id}
                              onClick={() => void remove(s)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="e.g. 09:00 AM"
                            value={newTime[key] ?? ""}
                            onChange={(e) =>
                              setNewTime((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="h-9 w-32 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void addSlot(route, kind)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
