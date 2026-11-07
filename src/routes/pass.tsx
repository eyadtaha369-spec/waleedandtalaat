import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Loader2, Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Logo } from "@/components/Brand";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addDays,
  cairoNow,
  morningPassState,
  returnWindow,
  specialSundayWindow,
  toDateKey,
  type MorningPassState,
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
// Backoff between retries on a failed token fetch.
const RETRY_DELAYS_MS = [1500, 3000, 6000];
type TokenState = "loading" | "ready" | "error";

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
  const [specialSundayActive, setSpecialSundayActive] = useState(false);

  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("special_sunday_active")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setSpecialSundayActive(!!data?.special_sunday_active));
  }, []);

  const [bookings, setBookings] = useState<Booking[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [tokenState, setTokenState] = useState<TokenState>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A live Cairo clock, re-derived every tick of `now` (every second) —
  // never a value frozen at mount, so a tab left open across midnight
  // or across 1:30 PM picks up the date/expiry change on its own. Every
  // date/time computation on this page goes through this (or the
  // cairoNow()/toDateKey() helpers it's built from) — never
  // new Date().getHours() or a UTC-sliced ISO string.
  const cairo = useMemo(() => cairoNow(new Date(now)), [now]);
  const today = toDateKey(cairo);
  const tomorrow = toDateKey(addDays(cairo, 1));
  // Must match dashboard.tsx's own computation, or a student who booked
  // the special Sunday trip would see the wrong date (or no booking at
  // all) here on their own pass.
  const specialSundayServiceDate = specialSundayActive
    ? specialSundayWindow(cairo).serviceDate
    : null;
  const rw = returnWindow(cairo);

  // Only changes identity when the actual calendar dates involved
  // change (midnight rollover, or the special-Sunday toggle) — never
  // every second — so it's safe to use as an effect/callback
  // dependency below without re-fetching on every clock tick.
  const fetchDates = useMemo(() => {
    const dates = new Set([today, tomorrow]);
    if (specialSundayServiceDate) dates.add(specialSundayServiceDate);
    return Array.from(dates);
  }, [today, tomorrow, specialSundayServiceDate]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // No caching anywhere in this fetch — a stale "no booking yet", or a
  // stale active/expired status, must never linger past its moment.
  const fetchBookings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("kind,slot,service_date,pickup_stop")
      .in("service_date", fetchDates);
    setBookings((data as Booking[]) ?? []);
  }, [user, fetchDates]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  // Keep bookings fresh on a tab that's just sitting open — e.g. an
  // admin edit elsewhere, or the trip simply crossing into tomorrow.
  useEffect(() => {
    const interval = setInterval(() => void fetchBookings(), 60_000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // Rotating boarding token: generate one immediately, then again every
  // ~45s. This is the real security layer — see the note above.
  //
  // A failed background refresh (attempt > 0 exhausted, or the interval
  // firing while the network is briefly down) must never blank a QR
  // that's already on screen — PassQr only shows the loading/error
  // placeholders when there's no payload yet, so an existing token
  // simply stays displayed while tokenState flips to "error" behind it.
  const refreshToken = async (attempt = 0, didRefreshSession = false): Promise<void> => {
    if (!user) return;
    if (attempt === 0) {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setTokenState("loading");
    }
    try {
      const { data, error, status } = await supabase.rpc("generate_boarding_token");
      if (error || !data) {
        const isJwtError = status === 401 || (error?.message ?? "").includes("JWT");
        if (isJwtError && !didRefreshSession) {
          await supabase.auth.refreshSession();
          didRefreshSession = true;
        }
        if (attempt < RETRY_DELAYS_MS.length) {
          retryTimerRef.current = setTimeout(
            () => void refreshToken(attempt + 1, didRefreshSession),
            RETRY_DELAYS_MS[attempt],
          );
          return;
        }
        setTokenState("error");
        return;
      }
      const result = data as { token: string; expires_at: string };
      setToken(result.token);
      setExpiresAt(new Date(result.expires_at).getTime());
      setTokenState("ready");
    } catch {
      if (attempt < RETRY_DELAYS_MS.length) {
        retryTimerRef.current = setTimeout(
          () => void refreshToken(attempt + 1, didRefreshSession),
          RETRY_DELAYS_MS[attempt],
        );
        return;
      }
      setTokenState("error");
    }
  };

  useEffect(() => {
    if (!user) return;
    void refreshToken();
    refreshTimerRef.current = setInterval(() => void refreshToken(), REFRESH_EVERY_SECONDS * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live ticking clock, used both for the countdown and the watermark.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Latest-callback refs so the visibility/pageshow listener below
  // (registered once, on mount) never calls a stale closure — it used
  // to capture refreshToken from the very first render, whose `user`
  // was still null, so returning to the tab silently never refreshed
  // anything.
  const refreshTokenRef = useRef(refreshToken);
  const fetchBookingsRef = useRef(fetchBookings);
  useEffect(() => {
    refreshTokenRef.current = refreshToken;
    fetchBookingsRef.current = fetchBookings;
  });

  // Hide the QR while the tab/app is actually backgrounded (not just
  // unfocused — window "blur" also fires for in-page things like a
  // native date picker or an autofill popup, which was locking the QR
  // spuriously). Doesn't stop a screenshot taken while visible — see
  // the note above — but does stop a QR sitting visible while the
  // student is doing something else with the phone unlocked. A
  // backgrounded tab can also be holding an expired token, or a stale
  // booking/expiry status, by the time it's shown again, so refresh
  // both immediately on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setLocked(true);
      } else {
        setLocked(false);
        void refreshTokenRef.current();
        void fetchBookingsRef.current();
      }
    };
    // Covers back/forward-cache restores, which don't always fire a
    // visibilitychange event on their own.
    const onPageShow = () => {
      setLocked(false);
      void fetchBookingsRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  // Today's own morning booking wins; otherwise the nearest future one
  // (tomorrow, or the special Sunday trip) so a student who booked
  // ahead still sees it, just in its "upcoming" state below.
  const todayMorningBooking = bookings.find(
    (b) => b.kind === "morning" && b.service_date === today,
  );
  const upcomingMorningBooking = bookings
    .filter((b) => b.kind === "morning" && b.service_date > today)
    .sort((a, b) => a.service_date.localeCompare(b.service_date))[0];
  const morningBooking = todayMorningBooking ?? upcomingMorningBooking ?? null;
  const morningState: MorningPassState | null = morningBooking
    ? morningPassState(morningBooking.service_date, cairo)
    : null;
  const returnBooking = bookings.find(
    (b) => b.kind === "return" && b.service_date === rw.serviceDate,
  );
  // An expired morning booking with no return booking to fall back on
  // gets the full locked state (with its own message) rather than a
  // card nobody can act on.
  const morningExpiredOnly = morningState === "expired" && !returnBooking;
  const noBookingAtAll = !morningBooking && !returnBooking;
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

        {noBookingAtAll ? (
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
        ) : morningExpiredOnly ? (
          <div className="flex flex-col items-center gap-3 border-y border-dashed border-border bg-secondary/60 p-8 text-center">
            <Lock className="text-muted-foreground size-6" />
            <p className="text-sm font-medium">{t("pass.morningExpiredHeading")}</p>
            <p className="text-xs text-muted-foreground">{t("pass.morningExpiredBody")}</p>
            <Link to="/dashboard">
              <Button size="sm" className="btn-gold mt-1">
                {t("pass.goToBookings")}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-border border-y border-dashed border-border">
            {morningBooking && morningState === "active" && (
              <PassQr
                title={t("dashboard.morningDeparture")}
                detail={`${formatSlotLabel(morningBooking.slot, lang)}${morningBooking.pickup_stop ? ` · ${morningBooking.pickup_stop}` : ""}`}
                payload={payload}
                locked={locked}
                tokenState={tokenState}
                onRetry={() => void refreshToken()}
                onUnlock={() => setLocked(false)}
                secondsLeft={secondsLeft}
                clockLabel={clockLabel}
                studentName={profile.full_name}
                studentPhone={profile.phone}
                t={t}
              />
            )}
            {morningBooking && morningState === "upcoming" && (
              <MorningStatusCard
                title={t("dashboard.morningDeparture")}
                detail={`${formatLocalizedDate(morningBooking.service_date, lang)} · ${formatSlotLabel(morningBooking.slot, lang)}${morningBooking.pickup_stop ? ` · ${morningBooking.pickup_stop}` : ""}`}
                badgeLabel={t("pass.morningActivatesAt")}
                badgeClassName="bg-muted text-muted-foreground"
              />
            )}
            {morningBooking && morningState === "expired" && (
              <MorningStatusCard
                title={t("dashboard.morningDeparture")}
                detail={`${formatLocalizedDate(morningBooking.service_date, lang)} · ${formatSlotLabel(morningBooking.slot, lang)}${morningBooking.pickup_stop ? ` · ${morningBooking.pickup_stop}` : ""}`}
                badgeLabel={t("pass.morningExpiredBadge")}
                badgeClassName="bg-destructive/15 text-destructive"
              />
            )}
            {returnBooking && (
              <PassQr
                title={t("dashboard.earlyReturn")}
                detail={formatSlotLabel(returnBooking.slot, lang)}
                payload={payload}
                locked={locked}
                tokenState={tokenState}
                onRetry={() => void refreshToken()}
                onUnlock={() => setLocked(false)}
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
  tokenState,
  onRetry,
  onUnlock,
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
  tokenState: TokenState;
  onRetry: () => void;
  onUnlock: () => void;
  secondsLeft: number | null;
  clockLabel: string;
  studentName: string;
  studentPhone: string | null;
  t: (key: string) => string;
}) {
  // Everything inside this forced-white box must use explicit colors,
  // never theme tokens (text-muted-foreground etc.) — the box stays
  // white (colorScheme: light) even when the app itself is in dark
  // mode, which is exactly what made the old locked-state text
  // invisible: it inherited a light-on-dark theme color onto a white
  // background.
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
        {tokenState === "loading" && !payload ? (
          <div className="flex size-[200px] flex-col items-center justify-center gap-2 text-center">
            <Loader2 className="size-8 animate-spin text-[#6b7280]" />
            <p className="px-4 text-xs font-medium text-[#1f2937]">{t("pass.loadingQr")}</p>
          </div>
        ) : tokenState === "error" && !payload ? (
          <div className="flex size-[200px] flex-col items-center justify-center gap-2 text-center">
            <AlertCircle className="size-8 text-[#6b7280]" />
            <p className="px-4 text-xs font-medium text-[#1f2937]">{t("pass.qrLoadFailed")}</p>
            <button
              type="button"
              onClick={onRetry}
              className="btn-gold rounded-full px-4 py-1.5 text-xs"
            >
              {t("pass.retry")}
            </button>
          </div>
        ) : locked ? (
          <button
            type="button"
            onClick={onUnlock}
            className="flex size-[200px] flex-col items-center justify-center gap-2 text-center"
          >
            <ShieldAlert className="size-8 text-[#6b7280]" />
            <p className="px-4 text-xs font-medium text-[#1f2937]">{t("pass.tapToShow")}</p>
          </button>
        ) : payload ? (
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
        ) : (
          <div className="size-[200px]" />
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

function MorningStatusCard({
  title,
  detail,
  badgeLabel,
  badgeClassName,
}: {
  title: string;
  detail: string;
  badgeLabel: string;
  badgeClassName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 bg-secondary/60 p-6 text-center">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
      <p className="text-sm font-semibold">{detail}</p>
      <Badge className={`mt-1 ${badgeClassName}`}>{badgeLabel}</Badge>
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
