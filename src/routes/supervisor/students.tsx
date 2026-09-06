import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { subscriptionBadge } from "@/lib/subscription";

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
};

function SupervisorStudentsPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("list_my_route_students");
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setStudents((data as StudentRow[]) ?? []);
    })();
  }, []);

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
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !profile?.assigned_route ? (
          <p className="text-sm text-muted-foreground">{t("supervisor.noRouteAssigned")}</p>
        ) : !students || students.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("supervisor.noStudents")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.stop")}</TableHead>
                <TableHead>{t("dashboard.subscription")}</TableHead>
                <TableHead>{t("dashboard.tripsRemaining")}</TableHead>
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
