import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Logo } from "@/components/Brand";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cairoNow, morningWindow, returnWindow, toDateKey } from "@/lib/schedule";
import { subscriptionBadge } from "@/lib/subscription";
import { formatLocalizedDate, formatSlotLabel } from "@/lib/i18n/dateFormat";

export const Route = createFileRoute("/pass")({
  head: () => ({
    meta: [
      { title: "Digital boarding pass — Waleed & Talaat" },
      {
        name: "description",
        content: "Your QR boarding pass with route, package trips and today's booking status.",
      },
      { property: "og:title", content: "Digital boarding pass — Waleed & Talaat" },
      { property: "og:description", content: "Scan-ready shuttle boarding pass." },
    ],
  }),
  component: PassPage,
});

type Booking = { kind: string; slot: string; service_date: string; pickup_stop: string | null };

function PassPage() {
  const { user, profile, loading } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [today] = useState(() => toDateKey(cairoNow()));
  const mw = useMemo(() => morningWindow(), []);
  const rw = useMemo(() => returnWindow(), []);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("bookings")
      .select("kind,slot,service_date,pickup_stop")
      .in("service_date", [mw.serviceDate, rw.serviceDate])
      .then(({ data }) => setBookings((data as Booking[]) ?? []));
  }, [user, mw.serviceDate, rw.serviceDate]);

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  const morningBooking = bookings.find(
    (b) => b.kind === "morning" && b.service_date === mw.serviceDate,
  );
  const returnBooking = bookings.find(
    (b) => b.kind === "return" && b.service_date === rw.serviceDate,
  );
  const payload = JSON.stringify({ v: 1, id: profile.id, name: profile.full_name });

  return (
    <main className="surface-navy min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="shadow-luxe mx-auto max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground">
        <div className="surface-navy flex items-center gap-3 p-5">
          <Logo size={44} />
          <div>
            <p className="font-display font-semibold">Waleed &amp; Talaat</p>
            <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">{t("pass.title")}</p>
          </div>
          <Badge className="btn-gold ms-auto">{formatLocalizedDate(today, lang)}</Badge>
        </div>

        <div className="flex items-center gap-4 p-6">
          <div className="size-20 shrink-0 overflow-hidden rounded-2xl border-gilded">
            <SmartAvatar
              photoUrl={profile.photo_url}
              name={profile.full_name}
              className="size-full text-2xl"
            />
          </div>
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

        {!morningBooking && !returnBooking ? (
          <div className="flex flex-col items-center gap-3 border-y border-dashed border-border bg-secondary/60 p-8 text-center">
            <Lock className="text-muted-foreground size-6" />
            <p className="text-sm font-medium">{t("pass.noBookingYet")}</p>
            <p className="text-xs text-muted-foreground">{t("pass.noBookingBody")}</p>
            <Link to="/dashboard">
              <Button size="sm" className="btn-gold mt-1">
                {t("pass.goToBookings")}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-border border-y border-dashed border-border">
            {morningBooking && (
              <PassQr
                title={t("dashboard.morningDeparture")}
                detail={`${formatSlotLabel(morningBooking.slot, lang)}${morningBooking.pickup_stop ? ` · ${morningBooking.pickup_stop}` : ""}`}
                payload={payload}
              />
            )}
            {returnBooking && (
              <PassQr
                title={t("dashboard.earlyReturn")}
                detail={formatSlotLabel(returnBooking.slot, lang)}
                payload={payload}
              />
            )}
          </div>
        )}

        <div className="px-6 pt-4">
          <Badge
            className={
              subscriptionBadge(profile.subscription_type, profile.payment_status).className
            }
          >
            {subscriptionBadge(profile.subscription_type, profile.payment_status).emoji}{" "}
            {subscriptionBadge(profile.subscription_type, profile.payment_status).label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 text-sm">
          <Cell
            label={
              profile.subscription_type === "70_trips"
                ? t("dashboard.tripsRemaining")
                : t("dashboard.subscription")
            }
            value={
              profile.subscription_type === "70_trips"
                ? `${profile.trips_remaining}/${profile.trips_total}`
                : t("dashboard.fullTerm")
            }
          />
          <Cell
            label={t("pass.standardReturn")}
            value={`${formatSlotLabel("04:00 PM", lang)} · ${t("pass.noBookingNeeded")}`}
          />
        </div>
      </div>
    </main>
  );
}

function PassQr({ title, detail, payload }: { title: string; detail: string; payload: string }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-secondary/60 p-6">
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
        <p className="text-sm font-semibold">{detail}</p>
      </div>
      <div className="rounded-2xl bg-white p-4">
        <QRCodeSVG value={payload} size={172} level="M" />
      </div>
    </div>
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
