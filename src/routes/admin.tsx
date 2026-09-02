import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Bus, ClipboardList, ScanLine, ShieldCheck, Upload, Users, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScannerPanel } from "@/components/admin/ScannerPanel";
import { ManifestsPanel } from "@/components/admin/ManifestsPanel";
import { RequestsPanel } from "@/components/admin/RequestsPanel";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { FleetPanel } from "@/components/admin/FleetPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";

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
  const { user, isStaff, isAdmin, loading } = useAuth();
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

  // Supervisors are restricted to the QR scanner only — no tabs, no
  // approvals, no manifests, no user setup. Admins get everything.
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="surface-navy shadow-luxe rounded-3xl p-6">
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Supervisor</p>
          <h1 className="text-2xl font-bold">Boarding scanner</h1>
        </div>
        <div className="mt-6">
          <ScannerPanel />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin dashboard</p>
          <h1 className="text-2xl font-bold">Boarding &amp; fleet control</h1>
        </div>
        <Link to="/admin/installments">
          <Button className="btn-gold">
            <Wallet className="size-4" /> Installments
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="scanner" className="mt-6">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-6">
          <TabsTrigger value="scanner">
            <ScanLine className="size-4" /> Scanner
          </TabsTrigger>
          <TabsTrigger value="manifests">
            <Users className="size-4" /> Manifests
          </TabsTrigger>
          <TabsTrigger value="fleet">
            <Bus className="size-4" /> Fleet
          </TabsTrigger>
          <TabsTrigger value="requests">
            <ClipboardList className="size-4" /> Requests
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload className="size-4" /> Import
          </TabsTrigger>
          <TabsTrigger value="users">
            <ShieldCheck className="size-4" /> Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="mt-5">
          <ScannerPanel />
        </TabsContent>
        <TabsContent value="manifests" className="mt-5">
          <ManifestsPanel />
        </TabsContent>
        <TabsContent value="fleet" className="mt-5">
          <FleetPanel />
        </TabsContent>
        <TabsContent value="requests" className="mt-5">
          <RequestsPanel />
        </TabsContent>
        <TabsContent value="import" className="mt-5">
          <ImportPanel />
        </TabsContent>
        <TabsContent value="users" className="mt-5">
          <UsersPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
