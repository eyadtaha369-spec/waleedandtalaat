import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
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
};

function AdminStudentsPage() {
  const { t } = useLanguage();
  const { routes } = useRoutes();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

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
