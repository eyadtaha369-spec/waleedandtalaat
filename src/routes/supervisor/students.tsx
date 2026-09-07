import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, RotateCcw, Rocket, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
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
import { subscriptionBadge } from "@/lib/subscription";
import { openGroupInvite } from "@/lib/whatsappGroups";
import { generateTempPassword, credentialsWhatsAppLink } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";

export const Route = createFileRoute("/supervisor/students")({
  head: () => ({ meta: [{ title: "My route's students — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <SupervisorStudentsPage />
    </AdminGuard>
  ),
});

type StudentRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  pickup_stop: string | null;
  subscription_type: string;
  trips_remaining: number;
  trips_total: number;
  whatsapp_invited_at: string | null;
  username: string | null;
};

function SupervisorStudentsPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupLink, setGroupLink] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [resettingRoute, setResettingRoute] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_my_route_students");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as StudentRow[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void supabase.rpc("list_routes_with_whatsapp_links").then(({ data }) => {
      const links = (data as { route: string; whatsapp_group_link: string | null }[]) ?? [];
      setGroupLink(
        links.find((r) => r.route === profile?.assigned_route)?.whatsapp_group_link ?? null,
      );
    });
  }, [profile?.assigned_route]);

  const markInvited = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.rpc("mark_whatsapp_invited", { p_student_ids: ids });
    setStudents((prev) =>
      (prev ?? []).map((s) =>
        ids.includes(s.user_id) ? { ...s, whatsapp_invited_at: new Date().toISOString() } : s,
      ),
    );
  };

  const resetInvited = async (ids: string[]) => {
    await supabase.rpc("reset_whatsapp_invited", { p_student_ids: ids });
    setStudents((prev) =>
      (prev ?? []).map((s) => (ids.includes(s.user_id) ? { ...s, whatsapp_invited_at: null } : s)),
    );
    toast.success(t("whatsapp.statusReset"));
  };

  const sendInvite = (s: StudentRow) => {
    if (!groupLink || !s.phone) {
      toast.error(t("whatsapp.noLinkForRoute"));
      return;
    }
    const opened = openGroupInvite(s.full_name, s.phone, profile?.assigned_route ?? "", groupLink);
    if (opened) void markInvited([s.user_id]);
    else toast.error(t("whatsapp.popupNote"));
  };

  const sendToNewStudents = async () => {
    if (!groupLink) {
      toast.error(t("whatsapp.noLinkForRoute"));
      return;
    }
    const targets = (students ?? []).filter((s) => !s.whatsapp_invited_at && s.phone);
    if (targets.length === 0) {
      toast.error(t("whatsapp.noNewStudents"));
      return;
    }
    setBroadcasting(true);
    const successfulIds: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i]!;
      const opened = openGroupInvite(
        s.full_name,
        s.phone!,
        profile?.assigned_route ?? "",
        groupLink,
      );
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

  const sendCredentials = async (s: StudentRow) => {
    if (!s.username || !s.phone) return;
    setBusyId(s.user_id);
    const newPassword = generateTempPassword();
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_password", user_id: s.user_id, new_password: newPassword },
    });
    setBusyId(null);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not reset password")),
      );
      return;
    }
    const link = credentialsWhatsAppLink({
      full_name: s.full_name,
      phone: s.phone,
      email: `${s.username}@wt-shuttle.app`,
      temp_password: newPassword,
    });
    window.open(link, "_blank");
    toast.success(t("students.credentialsSent"));
  };

  const resetRouteStatus = async () => {
    if (!profile?.assigned_route) return;
    if (!window.confirm(t("whatsapp.confirmResetRoute"))) return;
    setResettingRoute(true);
    await supabase.rpc("reset_route_whatsapp_status", { p_route: profile.assigned_route });
    setResettingRoute(false);
    toast.success(t("whatsapp.statusReset"));
    void load();
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {profile?.assigned_route ?? ""}
          </p>
          <h1 className="text-2xl font-bold">{t("supervisor.myStudents")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={resettingRoute}
            onClick={() => void resetRouteStatus()}
          >
            <RotateCcw className="size-4" /> {t("whatsapp.resetRouteButton")}
          </Button>
          <Button
            className="btn-gold"
            disabled={broadcasting}
            onClick={() => void sendToNewStudents()}
          >
            <Rocket className="size-4" /> {t("whatsapp.sendInviteNewStudents")}
          </Button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !profile?.assigned_route ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("supervisor.noRouteAssigned")}</p>
        ) : !students || students.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("supervisor.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.stop")}</TableHead>
                <TableHead>{t("dashboard.subscription")}</TableHead>
                <TableHead>{t("dashboard.tripsRemaining")}</TableHead>
                <TableHead>{t("students.username")}</TableHead>
                <TableHead>{t("students.source")}</TableHead>
                <TableHead>{t("whatsapp.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const badge = subscriptionBadge(s.subscription_type, "paid_full");
                return (
                  <TableRow key={s.user_id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
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
                    <TableCell className="font-mono text-xs">{s.username ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {s.username ? t("students.sourceBulkImport") : t("students.sourceSelfSignup")}
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
                        {s.username && s.phone && (
                          <Button
                            size="sm"
                            className="bg-success text-success-foreground hover:bg-success/90"
                            disabled={busyId === s.user_id}
                            onClick={() => void sendCredentials(s)}
                          >
                            <MessageCircle className="size-4" /> {t("students.sendCredentials")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
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
      {!loading && students && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <UsersRound className="size-3.5" /> {students.length}
        </p>
      )}
    </main>
  );
}
