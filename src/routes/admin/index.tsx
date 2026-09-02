import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bus,
  ClipboardList,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
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
  const today = useMemo(() => toDateKey(cairoNow()), []);
  const [kpis, setKpis] = useState<Kpis>({
    totalStudents: null,
    morningToday: null,
    earlyReturnToday: null,
    pendingInstallments: null,
  });

  useEffect(() => {
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
  }, [today]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <ProfileAvatar />
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            Waleed &amp; Talaat — Executive Admin Console
          </p>
          <h1 className="text-2xl font-bold">{profile?.full_name || "Admin"}</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={UsersRound} label="Total active students" value={kpis.totalStudents} />
        <KpiCard icon={Bus} label="Today's morning passengers" value={kpis.morningToday} />
        <KpiCard icon={Bus} label="Today's early return passengers" value={kpis.earlyReturnToday} />
        <KpiCard
          icon={Wallet}
          label="Pending 2nd installment"
          value={kpis.pendingInstallments}
          accent
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ShortcutCard
          to="/admin/manifests"
          icon={Users}
          title="Fleet Manifests & Bus Allocation"
          description="Passenger lists per slot, sector sub-counts, and the automated bus-sizing report."
        />
        <ShortcutCard
          to="/admin/installments"
          icon={Wallet}
          title="Installments & Financial Tracking"
          description="Track second-installment collections and send WhatsApp reminders."
        />
        <ShortcutCard
          to="/admin/requests"
          icon={ClipboardList}
          title="Daily Pass Approvals"
          description="Accept or reject non-subscriber daily pass requests."
        />
        <ShortcutCard
          to="/admin/scan"
          icon={ScanLine}
          title="QR Camera Scanner"
          description="Scan boarding passes and daily-pass QR codes at any slot."
        />
        <ShortcutCard
          to="/admin/users"
          icon={ShieldCheck}
          title="User Management"
          description="Create, edit, reset passwords for, or deactivate admins and supervisors."
        />
        <ShortcutCard
          to="/admin/import"
          icon={Upload}
          title="Bulk Student Import"
          description="Import the roster sheet or recover credentials for existing students."
        />
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
