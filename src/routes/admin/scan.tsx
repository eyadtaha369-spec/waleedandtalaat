import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ScannerPanel } from "@/components/admin/ScannerPanel";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/admin/scan")({
  head: () => ({ meta: [{ title: "Scanner — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <ScanPage />
    </AdminGuard>
  ),
});

function ScanPage() {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("admin.scannerTitle")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>
      <div className="mt-6">
        <ScannerPanel />
      </div>
    </main>
  );
}
