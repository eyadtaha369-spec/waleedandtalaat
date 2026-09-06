import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <UsersPage />
    </AdminGuard>
  ),
});

function UsersPage() {
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("users.adminsSupervisors")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>
      <div className="mt-6">
        <UsersPanel />
      </div>
    </main>
  );
}
