import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { ClipboardList, ScanLine, Upload, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScannerPanel } from "@/components/admin/ScannerPanel";
import { ManifestsPanel } from "@/components/admin/ManifestsPanel";
import { RequestsPanel } from "@/components/admin/RequestsPanel";
import { ImportPanel } from "@/components/admin/ImportPanel";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Supervisor dashboard — Waleed & Talaat" },
      {
        name: "description",
        content:
          "Scan boarding passes, review manifests, approve daily passes and import students.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isStaff, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (!isStaff) {
      toast.error("Staff access required.");
      void navigate({ to: "/dashboard" });
    }
  }, [loading, user, isStaff, navigate]);

  if (loading || !isStaff) {
    return <main className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe rounded-3xl p-6">
        <p className="text-xs tracking-[0.25em] uppercase opacity-70">Supervisor dashboard</p>
        <h1 className="text-2xl font-bold">Boarding &amp; fleet control</h1>
      </div>

      <Tabs defaultValue="scanner" className="mt-6">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="scanner">
            <ScanLine className="size-4" /> Scanner
          </TabsTrigger>
          <TabsTrigger value="manifests">
            <Users className="size-4" /> Manifests
          </TabsTrigger>
          <TabsTrigger value="requests">
            <ClipboardList className="size-4" /> Requests
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload className="size-4" /> Import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="mt-5">
          <ScannerPanel />
        </TabsContent>
        <TabsContent value="manifests" className="mt-5">
          <ManifestsPanel />
        </TabsContent>
        <TabsContent value="requests" className="mt-5">
          <RequestsPanel />
        </TabsContent>
        <TabsContent value="import" className="mt-5">
          <ImportPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
