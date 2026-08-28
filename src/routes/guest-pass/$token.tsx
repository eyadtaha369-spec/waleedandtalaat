import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { prettyDate } from "@/lib/schedule";

export const Route = createFileRoute("/guest-pass/$token")({
  head: () => ({
    meta: [
      { title: "Daily pass — Waleed & Talaat" },
      { name: "description", content: "Your one-day shuttle boarding pass." },
    ],
  }),
  component: GuestPassPage,
});

type GuestPass = {
  full_name: string;
  route: string;
  pickup_stop: string | null;
  slot: string;
  service_date: string;
  is_scanned: boolean;
};

function GuestPassPage() {
  const { token } = Route.useParams();
  const [pass, setPass] = useState<GuestPass | null | undefined>(undefined);

  useEffect(() => {
    void supabase
      .rpc("get_guest_pass", { p_token: token })
      .then(({ data }) => setPass((data as GuestPass[])?.[0] ?? null));
  }, [token]);

  if (pass === undefined) {
    return <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  if (pass === null) {
    return (
      <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-center text-card-foreground">
          <Hourglass className="text-accent mx-auto size-10" />
          <h1 className="mt-4 text-xl font-bold">Pass not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Please contact us on WhatsApp.
          </p>
        </div>
      </main>
    );
  }

  const payload = JSON.stringify({ v: 1, id: token, guest: true });

  return (
    <main className="surface-navy min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="shadow-luxe mx-auto max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground">
        <div className="surface-navy flex items-center gap-3 p-5">
          <Logo size={44} />
          <div>
            <p className="font-display font-semibold">Waleed &amp; Talaat</p>
            <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">Daily pass</p>
          </div>
          <Badge className="btn-gold ms-auto">{prettyDate(pass.service_date)}</Badge>
        </div>

        <div className="p-6">
          <h1 className="text-xl font-bold">{pass.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {pass.route}
            {pass.pickup_stop ? ` · ${pass.pickup_stop}` : ""} · {pass.slot}
          </p>
        </div>

        <div className="flex justify-center border-y border-dashed border-border bg-secondary/60 p-6">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={payload} size={196} level="M" />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 p-6 text-sm">
          {pass.is_scanned ? (
            <Badge className="bg-success text-success-foreground">
              <CheckCircle2 className="me-1 size-3.5" /> Already boarded
            </Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground">Not yet boarded</Badge>
          )}
        </div>
      </div>
    </main>
  );
}
