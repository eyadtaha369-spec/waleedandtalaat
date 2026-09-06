import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Bus, Ticket, Users } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ManifestsPanel } from "@/components/admin/ManifestsPanel";
import { FleetPanel } from "@/components/admin/FleetPanel";
import { TripBalancesPanel } from "@/components/admin/TripBalancesPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/admin/manifests")({
  head: () => ({ meta: [{ title: "Fleet manifests — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <ManifestsPage />
    </AdminGuard>
  ),
});

function ManifestsPage() {
  const [tab, setTab] = useState("manifests");
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("admin.fleetManifestsTitle")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="manifests">
            <Users className="size-4" /> {t("nav.manifests")}
          </TabsTrigger>
          <TabsTrigger value="fleet">
            <Bus className="size-4" /> {t("fleet.title").split(" — ")[0]}
          </TabsTrigger>
          <TabsTrigger value="trips">
            <Ticket className="size-4" /> {t("manifests.tripBalances")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manifests" className="mt-5">
          <ManifestsPanel />
        </TabsContent>
        <TabsContent value="fleet" className="mt-5">
          <FleetPanel />
        </TabsContent>
        <TabsContent value="trips" className="mt-5">
          <TripBalancesPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
