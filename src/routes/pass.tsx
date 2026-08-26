import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { cairoNow, prettyDate, toDateKey } from "@/lib/schedule";

export const Route = createFileRoute("/pass")({
  head: () => ({
    meta: [
      { title: "Digital boarding pass — Waleed & Talaat" },
      { name: "description", content: "Your QR boarding pass with route, package trips and today's booking status." },
      { property: "og:title", content: "Digital boarding pass — Waleed & Talaat" },
      { property: "og:description", content: "Scan-ready shuttle boarding pass." },
    ],
  }),
  component: PassPage,
});

function PassPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [today] = useState(() => toDateKey(cairoNow()));
  const [tomorrow] = useState(() => {
    const d = cairoNow();
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  });
  const [status, setStatus] = useState<{ kind: string; slot: string; service_date: string }[]>([]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("bookings")
      .select("kind,slot,service_date")
      .in("service_date", [today, tomorrow])
      .then(({ data }) => setStatus(data ?? []));
  }, [user, today, tomorrow]);

  if (!profile) {
    return <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  const payload = JSON.stringify({ v: 1, id: profile.id, name: profile.full_name });

  return (
    <main className="surface-navy min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="shadow-luxe mx-auto max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground">
        <div className="surface-navy flex items-center gap-3 p-5">
          <Logo size={44} />
          <div>
            <p className="font-display font-semibold">Waleed &amp; Talaat</p>
            <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">Boarding pass</p>
          </div>
          <Badge className="btn-gold ms-auto">{prettyDate(today)}</Badge>
        </div>

        <div className="flex items-center gap-4 p-6">
          {profile.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.full_name}
              className="size-20 rounded-2xl border-gilded object-cover"
            />
          ) : (
            <div className="border-gilded flex size-20 items-center justify-center rounded-2xl bg-secondary text-2xl font-bold">
              {(profile.full_name || "?").charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{profile.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {profile.route ?? "—"} · {profile.pickup_stop ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ID {profile.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex justify-center border-y border-dashed border-border bg-secondary/60 p-6">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={payload} size={196} level="M" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 text-sm">
          <Cell
            label={profile.subscription_type === "package" ? "Trips remaining" : "Subscription"}
            value={
              profile.subscription_type === "package"
                ? `${profile.trips_remaining}/${profile.trips_total}`
                : "Full term"
            }
          />
          <Cell label="Standard return" value="04:00 PM" />
          <Cell
            label="Morning"
            value={
              status.find((s) => s.kind === "morning")
                ? `${status.find((s) => s.kind === "morning")!.slot} ✓`
                : "Not booked"
            }
          />
          <Cell
            label="Early return"
            value={
              status.find((s) => s.kind === "return" && s.service_date === today)
                ? `${status.find((s) => s.kind === "return" && s.service_date === today)!.slot} ✓`
                : "Not booked"
            }
          />
        </div>
      </div>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
