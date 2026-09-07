import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, RotateCcw, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
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
import { subscriptionBadge } from "@/lib/subscription";
import { openGroupInvite } from "@/lib/whatsappGroups";

export const Route = createFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Student directory — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <AdminStudentsPage />
    </AdminGuard>
  ),
});

type StudentRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  pickup_stop: string | null;
  subscription_type: string;
  payment_status: string;
  trips_remaining: number;
  trips_total: number;
  whatsapp_invited_at: string | null;
};

type RouteLink = { route: string; whatsapp_group_link: string | null };

function AdminStudentsPage() {
  const { t } = useLanguage();
  const { routes } = useRoutes();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [routeLinks, setRouteLinks] = useState<RouteLink[]>([]);
  const [broadcasting, setBroadcasting] = useState(false);
  const [resettingRoute, setResettingRoute] = useState(false);

  const load = async (route: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_all_students", {
      p_route: route === "all" ? null : route,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as StudentRow[]) ?? []);
  };

  useEffect(() => {
    void load(routeFilter);
  }, [routeFilter]);

  useEffect(() => {
    void supabase
      .rpc("list_routes_with_whatsapp_links")
      .then(({ data }) => setRouteLinks((data as RouteLink[]) ?? []));
  }, []);

  const linkForRoute = (route: string | null) =>
    routeLinks.find((r) => r.route === route)?.whatsapp_group_link ?? null;

  const markInvited = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.rpc("mark_whatsapp_invited", { p_student_ids: ids });
    setStudents((prev) =>
      prev.map((s) =>
        ids.includes(s.user_id) ? { ...s, whatsapp_invited_at: new Date().toISOString() } : s,
      ),
    );
  };

  const resetInvited = async (ids: string[]) => {
    await supabase.rpc("reset_whatsapp_invited", { p_student_ids: ids });
    setStudents((prev) =>
      prev.map((s) => (ids.includes(s.user_id) ? { ...s, whatsapp_invited_at: null } : s)),
    );
    toast.success(t("whatsapp.statusReset"));
  };

  const sendInvite = (s: StudentRow) => {
    const link = linkForRoute(s.route);
    if (!link || !s.phone) {
      toast.error(t("whatsapp.noLinkForRoute"));
      return;
    }
    // Only mark invited if the popup actually opened — a blocked
    // popup must never be recorded as a delivered invite.
    const opened = openGroupInvite(s.full_name, s.phone, s.route ?? "", link);
    if (opened) void markInvited([s.user_id]);
    else toast.error(t("whatsapp.popupNote"));
  };

  const sendToNewStudents = async () => {
    const targets = filtered.filter(
      (s) => !s.whatsapp_invited_at && s.phone && linkForRoute(s.route),
    );
    if (targets.length === 0) {
      toast.error(t("whatsapp.noNewStudents"));
      return;
    }
    setBroadcasting(true);
    const successfulIds: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i]!;
      const link = linkForRoute(s.route)!;
      const opened = openGroupInvite(s.full_name, s.phone!, s.route ?? "", link);
      if (opened) successfulIds.push(s.user_id);
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    await markInvited(successfulIds);
    setBroadcasting(false);
    if (successfulIds.length < targets.length) {
      toast.error(t("whatsapp.popupNote"), { duration: 8000 });
    } else {
      toast.success(`${successfulIds.length} ✓`);
    }
  };

  const resetRouteStatus = async () => {
    if (routeFilter === "all") {
      toast.error(t("whatsapp.selectRouteFirst"));
      return;
    }
    if (!window.confirm(t("whatsapp.confirmResetRoute"))) return;
    setResettingRoute(true);
    await supabase.rpc("reset_route_whatsapp_status", { p_route: routeFilter });
    setResettingRoute(false);
    toast.success(t("whatsapp.statusReset"));
    void load(routeFilter);
  };

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone ?? "").includes(q);
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("students.masterDirectory")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
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
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Badge className="btn-gold">{filtered.length}</Badge>
          <div className="ms-auto flex flex-wrap gap-2">
            {routeFilter !== "all" && (
              <Button
                variant="outline"
                disabled={resettingRoute}
                onClick={() => void resetRouteStatus()}
              >
                <RotateCcw className="size-4" /> {t("whatsapp.resetRouteButton")}
              </Button>
            )}
            <Button
              className="btn-gold"
              disabled={broadcasting}
              onClick={() => void sendToNewStudents()}
            >
              <Rocket className="size-4" /> {t("whatsapp.sendInviteNewStudents")}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("students.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("common.stop")}</TableHead>
                <TableHead>{t("dashboard.subscription")}</TableHead>
                <TableHead>{t("dashboard.tripsRemaining")}</TableHead>
                <TableHead>{t("whatsapp.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const badge = subscriptionBadge(s.subscription_type, s.payment_status);
                return (
                  <TableRow key={s.user_id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.route ?? "—"}</TableCell>
                    <TableCell>{s.pickup_stop ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={badge.className}>
                        {badge.emoji} {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.subscription_type === "70_trips" ? (
                        `${s.trips_remaining}/${s.trips_total}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.whatsapp_invited_at ? (
                        <Badge className="bg-success text-success-foreground">
                          🟢 {t("whatsapp.invited")}
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive text-destructive-foreground">
                          🔴 {t("whatsapp.pending")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          className="bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => sendInvite(s)}
                        >
                          <MessageCircle className="size-4" /> {t("whatsapp.sendInvite")}
                        </Button>
                        {s.whatsapp_invited_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void resetInvited([s.user_id])}
                          >
                            <RotateCcw className="size-4" /> {t("whatsapp.resetStatus")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
