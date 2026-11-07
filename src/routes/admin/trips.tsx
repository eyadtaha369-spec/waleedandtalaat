import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { TripsAdminPanel } from "@/components/admin/TripsAdminPanel";
import { useLanguage } from "@/hooks/useLanguage";

const tripsSearchSchema = z.object({
  package: z.string().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/admin/trips")({
  head: () => ({ meta: [{ title: "الرحلات السياحية — Waleed & Talaat" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    try {
      return tripsSearchSchema.parse(search);
    } catch {
      return {};
    }
  },
  component: () => (
    <AdminGuard requireAdmin>
      <TripsAdminPage />
    </AdminGuard>
  ),
});

function TripsAdminPage() {
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("tourismAdmin.title")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>
      <div className="mt-6">
        <TripsAdminPanel />
      </div>
    </main>
  );
}
