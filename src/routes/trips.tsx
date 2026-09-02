import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "My trips — Waleed & Talaat" },
      {
        name: "description",
        content: "Every trip scanned against your account, with date and time.",
      },
    ],
  }),
  component: TripsPage,
});

type Scan = {
  id: string;
  slot: string | null;
  service_date: string;
  scanned_at: string;
  scanned_by: string | null;
};

function TripsPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[] | null>(null);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("scans")
      .select("id,slot,service_date,scanned_at,scanned_by")
      .eq("student_id", user.id)
      .order("scanned_at", { ascending: false })
      .then(({ data }) => setScans((data as Scan[]) ?? []));
  }, [user]);

  if (!profile) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="surface-navy shadow-luxe rounded-3xl p-6">
        <p className="text-xs tracking-[0.25em] uppercase opacity-70">My trips</p>
        <h1 className="text-2xl font-bold">Scan history</h1>
        {profile.subscription_type === "70_trips" && (
          <p className="mt-1 text-sm opacity-80">
            {profile.trips_remaining}/{profile.trips_total} trips remaining
          </p>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        {scans === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : scans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips scanned yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {scans.map((s) => {
              const dt = new Date(s.scanned_at);
              const dayLabel = dt.toLocaleDateString("en-GB", {
                timeZone: "Africa/Cairo",
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const timeLabel = dt.toLocaleTimeString("en-US", {
                timeZone: "Africa/Cairo",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              const isAuto = !s.scanned_by;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                      isAuto ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
                    }`}
                  >
                    {isAuto ? <Zap className="size-4" /> : <CheckCircle2 className="size-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{dayLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeLabel} · {s.slot ?? "—"}
                    </p>
                  </div>
                  {isAuto && (
                    <Badge className="bg-warning text-warning-foreground">Auto no-show</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
