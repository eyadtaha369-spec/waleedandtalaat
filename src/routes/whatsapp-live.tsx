import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

export const Route = createFileRoute("/whatsapp-live")({
  head: () => ({ meta: [{ title: "WhatsApp Live Group Hub — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <WhatsAppLivePage />
    </AdminGuard>
  ),
});

type StudentRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  whatsapp_invited_at: string | null;
};

type RouteLink = { route: string; whatsapp_group_link: string | null };

function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function inviteLink(fullName: string, phone: string, routeName: string, groupLink: string): string {
  const message =
    `أهلاً ${fullName}، برجاء الانضمام لجروب الواتساب الخاص بخطك (${routeName}) ` +
    `لتلقي المواعيد والتنبيهات اليومية عبر الرابط التالي: ${groupLink}`;
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

function WhatsAppLivePage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();

  const [routeLinks, setRouteLinks] = useState<RouteLink[]>([]);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [linkDraft, setLinkDraft] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broadcasting, setBroadcasting] = useState(false);

  // Supervisors are locked to their own route the whole time.
  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("list_routes_with_whatsapp_links");
      if (error) {
        toast.error(error.message);
        return;
      }
      setRouteLinks((data as RouteLink[]) ?? []);
    })();
  }, []);

  const load = async (route: string) => {
    setLoading(true);
    setSelected(new Set());
    const { data, error } = await supabase.rpc("list_route_students_for_whatsapp", {
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
    void load(effectiveRoute || "all");
  }, [effectiveRoute]);

  const currentRouteLink = useMemo(
    () => routeLinks.find((r) => r.route === effectiveRoute)?.whatsapp_group_link ?? null,
    [routeLinks, effectiveRoute],
  );

  useEffect(() => {
    setLinkDraft(currentRouteLink ?? "");
  }, [currentRouteLink]);

  const saveLink = async () => {
    if (!effectiveRoute || effectiveRoute === "all") {
      toast.error(t("whatsapp.selectRouteFirst"));
      return;
    }
    setSavingLink(true);
    const { error } = await supabase.rpc("set_route_whatsapp_link", {
      p_route: effectiveRoute,
      p_link: linkDraft,
    });
    setSavingLink(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("whatsapp.linkSaved"));
    setRouteLinks((prev) =>
      prev.map((r) => (r.route === effectiveRoute ? { ...r, whatsapp_group_link: linkDraft } : r)),
    );
  };

  const linkForStudentRoute = (route: string | null) =>
    routeLinks.find((r) => r.route === route)?.whatsapp_group_link ?? null;

  const markInvited = async (ids: string[]) => {
    const { error } = await supabase.rpc("mark_whatsapp_invited", { p_student_ids: ids });
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((prev) =>
      prev.map((s) =>
        ids.includes(s.user_id) ? { ...s, whatsapp_invited_at: new Date().toISOString() } : s,
      ),
    );
  };

  const sendInvite = (s: StudentRow) => {
    const link = linkForStudentRoute(s.route);
    if (!link || !s.phone) {
      toast.error(t("whatsapp.linkMissingForRoute"));
      return;
    }
    window.open(
      inviteLink(s.full_name, s.phone, s.route ?? "", link),
      "_blank",
      "noopener,noreferrer",
    );
    void markInvited([s.user_id]);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === students.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(students.map((s) => s.user_id)));
    }
  };

  const broadcast = async () => {
    if (selected.size === 0) {
      toast.error(t("whatsapp.selectStudentsFirst"));
      return;
    }
    setBroadcasting(true);
    const targets = students.filter((s) => selected.has(s.user_id) && s.phone);
    const invitedIds: string[] = [];
    targets.forEach((s, i) => {
      const link = linkForStudentRoute(s.route);
      if (!link || !s.phone) return;
      setTimeout(() => {
        window.open(
          inviteLink(s.full_name, s.phone!, s.route ?? "", link),
          "_blank",
          "noopener,noreferrer",
        );
      }, i * 400);
      invitedIds.push(s.user_id);
    });
    if (invitedIds.length > 0) {
      await markInvited(invitedIds);
    }
    setBroadcasting(false);
    toast.success(t("whatsapp.popupNote"), { duration: 8000 });
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("whatsapp.title")}</h1>
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
              {routeLinks.map((r) => (
                <option key={r.route} value={r.route}>
                  {r.route}
                </option>
              ))}
            </select>
          ) : (
            <Badge className="btn-gold">{profile?.assigned_route ?? "—"}</Badge>
          )}
        </div>

        {effectiveRoute && effectiveRoute !== "all" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              placeholder={t("whatsapp.linkPlaceholder")}
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              className="max-w-sm"
              disabled={!isAdmin}
            />
            {isAdmin && (
              <Button
                size="sm"
                className="btn-gold"
                disabled={savingLink}
                onClick={() => void saveLink()}
              >
                {t("whatsapp.saveLink")}
              </Button>
            )}
            {!currentRouteLink && (
              <span className="text-xs text-muted-foreground">{t("whatsapp.noLinkSet")}</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={students.length > 0 && selected.size === students.length}
              onChange={toggleSelectAll}
            />
            {t("whatsapp.selectAll")}
          </label>
          <Button
            className="btn-gold ms-auto"
            disabled={broadcasting || selected.size === 0}
            onClick={() => void broadcast()}
          >
            <Radio className="size-4" /> {t("whatsapp.broadcast")}
          </Button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : students.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("whatsapp.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("whatsapp.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(s.user_id)}
                      onChange={() => toggleSelect(s.user_id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.route ?? "—"}</TableCell>
                  <TableCell>
                    {s.whatsapp_invited_at ? (
                      <Badge className="bg-success text-success-foreground">
                        {t("whatsapp.invited")}
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">
                        {t("whatsapp.pending")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="sm" variant="outline" onClick={() => sendInvite(s)}>
                      <MessageCircle className="size-4" /> {t("whatsapp.sendInvite")}
                    </Button>
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
