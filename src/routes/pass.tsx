import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Logo } from "@/components/Brand";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cairoNow,
  morningWindow,
  returnWindow,
  routeDashboardDefaultDate,
  specialSundayWindow,
  toDateKey,
} from "@/lib/schedule";
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

const TOKEN_LIFETIME_SECONDS = 60;
// Refresh a bit before actual expiry so there's never a dead window
// where the displayed QR is already invalid.
const REFRESH_EVERY_SECONDS = 45;

/**
 * Security note on what this page actually protects against, and what
 * it doesn't: the rotating token (below) is real — scan_pass() rejects
 * an expired or already-used token server-side, so a captured
 * screenshot stops working within ~60 seconds. The blur-on-tab-switch,
 * disabled right-click/selection, and watermark are honest deterrents,
 * not hard security — nothing running in a browser can truly prevent
 * a screenshot or a second phone's camera pointed at the screen. They
 * make casual sharing/recording more annoying and traceable, not
 * impossible.
 */
function PassPage() {
  const { user, profile, loading } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [today] = useState(() => toDateKey(cairoNow()));
  const [specialSundayActive, setSpecialSundayActive] = useState(false);

  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("special_sunday_active")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setSpecialSundayActive(!!data?.special_sunday_active));
  }, []);

  // Must match dashboard.tsx's own computation exactly, or a student
  // who booked the special Sunday trip would see the wrong date (or
  // no booking at all) here on their own pass.
  const mw = useMemo(
    () => (specialSundayActive ? specialSundayWindow() : morningWindow()),
    [specialSundayActive],
  );
  const rw = useMemo(() => returnWindow(), []);
  // Same cutoff-aware substitution as dashboard.tsx — see its comment.
  // Must stay in lockstep with dashboard.tsx's computation, per the
  // note above.
  const morningServiceDate = specialSundayActive ? mw.serviceDate : routeDashboardDefaultDate();
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("bookings")
      .select("kind,slot,service_date,pickup_stop")
      .in("service_date", [morningServiceDate, rw.serviceDate])
      .then(({ data }) => setBookings((data as Booking[]) ?? []));
  }, [user, morningServiceDate, rw.serviceDate]);

  // Rotating boarding token: generate one immediately, then again every
  // ~45s. This is the real security layer — see the note above.
  const refreshToken = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("generate_boarding_token");
    if (error || !data) return;
    const result = data as { token: string; expires_at: string };
    setToken(result.token);
    setExpiresAt(new Date(result.expires_at).getTime());
  };

  useEffect(() => {
    if (!user) return;
    void refreshToken();
    refreshTimerRef.current = setInterval(() => void refreshToken(), REFRESH_EVERY_SECONDS * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live ticking clock, used both for the countdown and the watermark.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Blur/hide the QR when the tab loses focus or the app is switched
  // away from. Doesn't stop a screenshot taken while focused — see the
  // note above — but does stop a QR sitting visible in the background
  // while the student is doing something else with the phone unlocked.
  useEffect(() => {
    const onVisibility = () => setLocked(document.hidden);
    const onBlur = () => setLocked(true);
    const onFocus = () => setLocked(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  const morningBooking = bookings.find(
    (b) => b.kind === "morning" && b.service_date === morningServiceDate,
  );
  const returnBooking = bookings.find(
    (b) => b.kind === "return" && b.service_date === rw.serviceDate,
  );
  const payload = token ? JSON.stringify({ v: 2, token, name: profile.full_name }) : null;
  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const clockLabel = new Date(now).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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
                locked={locked}
                secondsLeft={secondsLeft}
                clockLabel={clockLabel}
                studentName={profile.full_name}
                studentPhone={profile.phone}
                t={t}
              />
            )}
            {returnBooking && (
              <PassQr
                title={t("dashboard.earlyReturn")}
                detail={formatSlotLabel(returnBooking.slot, lang)}
                payload={payload}
                locked={locked}
                secondsLeft={secondsLeft}
                clockLabel={clockLabel}
                studentName={profile.full_name}
                studentPhone={profile.phone}
                t={t}
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

function PassQr({
  title,
  detail,
  payload,
  locked,
  secondsLeft,
  clockLabel,
  studentName,
  studentPhone,
  t,
}: {
  title: string;
  detail: string;
  payload: string | null;
  locked: boolean;
  secondsLeft: number | null;
  clockLabel: string;
  studentName: string;
  studentPhone: string | null;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 bg-secondary/60 p-6">
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
        <p className="text-sm font-semibold">{detail}</p>
      </div>
      <div
        className="relative select-none rounded-2xl p-4"
        style={{
          backgroundColor: "#ffffff",
          colorScheme: "light",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {locked || !payload ? (
          <div className="flex size-[200px] flex-col items-center justify-center gap-2 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <p className="px-4 text-xs font-medium text-muted-foreground">
              {t("pass.securityLocked")}
            </p>
          </div>
        ) : (
          <>
            <div className="pointer-events-none">
              <QRCodeSVG
                value={payload}
                size={200}
                level="H"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            </div>
            {/* Semi-transparent watermark: makes a shared screen
                recording traceable back to this specific student,
                without obscuring the QR itself for scanning. */}
            <div
              className="pointer-events-none absolute inset-0 flex -rotate-45 flex-col items-center justify-center gap-0.5 overflow-hidden text-center opacity-15"
              aria-hidden="true"
            >
              <p className="text-[9px] font-bold whitespace-nowrap text-black">{studentName}</p>
              {studentPhone && (
                <p className="text-[9px] font-bold whitespace-nowrap text-black">{studentPhone}</p>
              )}
              <p className="text-[9px] font-bold whitespace-nowrap text-black">{clockLabel}</p>
            </div>
          </>
        )}
      </div>
      {!locked && payload && secondsLeft !== null && (
        <p className="text-[11px] text-muted-foreground">
          {t("pass.refreshesIn")} {secondsLeft}s
        </p>
      )}
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
