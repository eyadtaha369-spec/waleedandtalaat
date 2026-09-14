import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
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
import { edgeFunctionErrorMessage } from "@/lib/functionsError";

const DEFAULT_PASSWORD = "wt@2027";

export const Route = createFileRoute("/admin/student-accounts")({
  head: () => ({ meta: [{ title: "Student Accounts — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <StudentAccountsPage />
    </AdminGuard>
  ),
});

type StudentAccount = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  photo_url: string | null;
  must_change_password: boolean;
};

function StudentAccountsPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes } = useRoutes();

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_route_student_accounts", {
      p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as StudentAccount[]) ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoute]);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone ?? "").includes(q);
  });

  const copyDefault = async () => {
    await navigator.clipboard.writeText(DEFAULT_PASSWORD);
    toast.success(t("studentAccounts.copied"));
  };

  const resetToDefault = async (s: StudentAccount) => {
    if (!window.confirm(t("studentAccounts.confirmReset"))) return;
    setBusyId(s.user_id);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_password", user_id: s.user_id, new_password: DEFAULT_PASSWORD },
    });
    if (error || data?.error) {
      setBusyId(null);
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not reset password")),
      );
      return;
    }
    const { error: flagError } = await supabase.rpc("flag_password_reset", {
      p_student_id: s.user_id,
    });
    setBusyId(null);
    if (flagError) {
      toast.error(flagError.message);
      return;
    }
    setStudents((prev) =>
      prev.map((x) => (x.user_id === s.user_id ? { ...x, must_change_password: true } : x)),
    );
    toast.success(t("studentAccounts.resetDone"));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("studentAccounts.title")}</h1>
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
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="outline" className="ms-auto" onClick={() => void copyDefault()}>
            <Copy className="size-4" /> {t("studentAccounts.copyDefault")}
          </Button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("studentAccounts.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                {isAdmin && routeFilter === "all" && <TableHead>{t("common.route")}</TableHead>}
                <TableHead>{t("studentAccounts.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell>
                    <div className="size-9 overflow-hidden rounded-full">
                      <SmartAvatar
                        photoUrl={s.photo_url}
                        name={s.full_name}
                        className="size-full text-xs"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                  {isAdmin && routeFilter === "all" && <TableCell>{s.route ?? "—"}</TableCell>}
                  <TableCell>
                    {s.must_change_password ? (
                      <Badge className="bg-warning text-warning-foreground">
                        {t("studentAccounts.defaultPassword")}
                      </Badge>
                    ) : (
                      <Badge className="bg-success text-success-foreground">
                        {t("studentAccounts.changed")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === s.user_id}
                      onClick={() => void resetToDefault(s)}
                    >
                      <RotateCcw className="size-4" /> {t("studentAccounts.resetToDefault")}
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
