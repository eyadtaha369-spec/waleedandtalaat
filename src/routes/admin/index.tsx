import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bus,
  ClipboardList,
  GraduationCap,
  ScanLine,
  ShieldCheck,
  Ticket,
  Upload,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { RETURN_SLOTS, cairoNow, toDateKey } from "@/lib/schedule";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Executive Admin Console — Waleed & Talaat" },
      {
        name: "description",
        content:
          "Fleet manifests, installments, daily pass approvals, scanner, and user management.",
      },
    ],
  }),
  component: () => (
    <AdminGuard requireAdmin>
      <AdminConsole />
    </AdminGuard>
  ),
});

type Kpis = {
  totalStudents: number | null;
  morningToday: number | null;
  earlyReturnToday: number | null;
  pendingInstallments: number | null;
};

function AdminConsole() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const today = useMemo(() => toDateKey(cairoNow()), []);
  const [kpis, setKpis] = useState<Kpis>({
    totalStudents: null,
    morningToday: null,
    earlyReturnToday: null,
    pendingInstallments: null,
  });
  const [runningCron, setRunningCron] = useState(false);

  const refreshKpis = () => {
    void (async () => {
      const [students, morning, earlyReturn, installments] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "student"),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("kind", "morning")
          .eq("service_date", today),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("kind", "return")
          .eq("service_date", today)
          .in("slot", [...RETURN_SLOTS]),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("installment_status", "pending_second"),
      ]);
      setKpis({
        totalStudents: students.count ?? 0,
        morningToday: morning.count ?? 0,
        earlyReturnToday: earlyReturn.count ?? 0,
        pendingInstallments: installments.count ?? 0,
      });
    })();
  };

  useEffect(refreshKpis, [today]);

  const runCronTest = async () => {
    setRunningCron(true);
    const { data, error } = await supabase.rpc("apply_4pm_noshow_deduction", { p_date: null });
    setRunningCron(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Cron test failed");
      return;
    }
    const result = data as {
      deducted_students_count: number;
      updated_balances: { student_id: string; full_name: string; trips_remaining: number }[];
    };
    console.log("4:15 PM auto-deduction test result", result);
    if (result.deducted_students_count === 0) {
      toast.success("No eligible no-shows right now — 0 students deducted.");
    } else {
      const names = result.updated_balances.map(
        (b) => `${b.full_name} (${b.trips_remaining} left)`,
      );
      toast.success(
        `Deducted ${result.deducted_students_count} student${result.deducted_students_count === 1 ? "" : "s"}: ${names.join(", ")}`,
        { duration: 12000 },
      );
    }
    refreshKpis();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <ProfileAvatar />
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">{t("admin.console")}</p>
          <h1 className="text-2xl font-bold">{profile?.full_name || "Admin"}</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={UsersRound}
          label={t("admin.totalActiveStudents")}
          value={kpis.totalStudents}
        />
        <KpiCard icon={Bus} label={t("admin.morningPassengersToday")} value={kpis.morningToday} />
        <KpiCard
          icon={Bus}
          label={t("admin.earlyReturnPassengersToday")}
          value={kpis.earlyReturnToday}
        />
        <KpiCard
          icon={Wallet}
          label={t("admin.pendingSecondInstallment")}
          value={kpis.pendingInstallments}
          accent
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ShortcutCard
          to="/admin/manifests"
          icon={Users}
          title={t("admin.fleetManifestsTitle")}
          description={t("admin.fleetManifestsDesc")}
        />
        <ShortcutCard
          to="/admin/installments"
          icon={Wallet}
          title={t("admin.installmentsTitle")}
          description={t("admin.installmentsDesc")}
        />
        <ShortcutCard
          to="/admin/requests"
          icon={ClipboardList}
          title={t("admin.dailyPassApprovalsTitle")}
          description={t("admin.dailyPassApprovalsDesc")}
        />
        <ShortcutCard
          to="/admin/summer-bookings"
          icon={GraduationCap}
          title={t("admin.summerBookingsTitle")}
          description={t("admin.summerBookingsDesc")}
        />
        <ShortcutCard
          to="/admin/students"
          icon={UsersRound}
          title={t("students.masterDirectory")}
          description={t("admin.studentsDesc")}
        />
        <ShortcutCard
          to="/admin/daily-passes"
          icon={Ticket}
          title={t("dailyPasses.trackingTitle")}
          description={t("admin.dailyPassesTrackingDesc")}
        />
        <ShortcutCard
          to="/admin/scan"
          icon={ScanLine}
          title={t("admin.scannerTitle")}
          description={t("admin.scannerDesc")}
        />
        <ShortcutCard
          to="/admin/users"
          icon={ShieldCheck}
          title={t("admin.usersTitle")}
          description={t("admin.usersDesc")}
        />
        <ShortcutCard
          to="/admin/import"
          icon={Upload}
          title={t("admin.importTitle")}
          description={t("admin.importDesc")}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-accent/60 bg-accent/5 p-5">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          {t("admin.devTesting")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={runningCron} onClick={() => void runCronTest()}>
            <Zap className="size-4" /> {t("admin.runCronButton")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("admin.runCronDesc")}</p>
        </div>
      </div>
    </main>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Bus;
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-gilded" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs tracking-widest text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-gilded" : ""}`}>
        {value === null ? "…" : value}
      </p>
    </div>
  );
}

function ShortcutCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Bus;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent"
    >
      <Icon className="text-accent size-6" />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
