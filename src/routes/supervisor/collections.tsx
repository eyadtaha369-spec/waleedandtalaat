import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { CollectionsPanel } from "@/components/supervisor/CollectionsPanel";

export const Route = createFileRoute("/supervisor/collections")({
  head: () => ({ meta: [{ title: "Log a collection — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <SupervisorCollectionsPage />
    </AdminGuard>
  ),
});

function SupervisorCollectionsPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {profile?.assigned_route ?? ""}
          </p>
          <h1 className="text-2xl font-bold">{t("collections.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div className="mt-6">
        <CollectionsPanel />
      </div>
    </main>
  );
}
