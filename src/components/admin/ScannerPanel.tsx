import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { CheckCircle2, ScanLine, UserPlus, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALL_SLOTS, MORNING_SLOTS, cairoNow, toDateKey } from "@/lib/schedule";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";

const SCANNER_ELEMENT_ID = "wt-qr-scanner";

type ScanStatus = "booked" | "not_booked" | "scanned_earlier" | "no_trips_left";

type ScanResult = {
  status: ScanStatus;
  fullName: string;
  route: string | null;
  photoUrl: string | null;
  tripsRemaining: number | null;
  tripsTotal: number | null;
  hasCompanion: boolean;
  override?: boolean;
};

export function ScannerPanel() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes } = useRoutes();
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [dateOverride, setDateOverride] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scannedToday, setScannedToday] = useState<number | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [walkInRoute, setWalkInRoute] = useState("");
  const [walkInNote, setWalkInNote] = useState("");
  const [walkInBusy, setWalkInBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);
  const lastScanRef = useRef<{ token: string; slot: string } | null>(null);
  const todayKey = toDateKey(cairoNow());
  const isMorningSlot = (MORNING_SLOTS as readonly string[]).includes(slot);
  // A supervisor's own route is unambiguous for a departure walk-in.
  // An admin using the scanner has no such context in this page, so
  // they (like everyone for a return walk-in, where the bus isn't
  // route-specific to begin with) pick a route via the dialog instead.
  const canUseOwnRouteForMorning = !isAdmin && !!profile?.assigned_route;

  const loadScannedCount = async () => {
    const { data } = await supabase.rpc("count_today_scanned_exam_passes");
    setScannedToday((data as number) ?? 0);
  };

  useEffect(() => {
    void loadScannedCount();
    const interval = setInterval(() => void loadScannedCount(), 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      void scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  const start = async () => {
    setResult(null);
    setScanning(true);
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // A fixed pixel qrbox doesn't scale with the actual
          // viewfinder size, and on iOS (see videoConstraints below)
          // that viewfinder isn't a fixed size to begin with — derive
          // the box from whatever the viewfinder actually renders at.
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.7);
            return { width: qrboxSize, height: qrboxSize };
          },
          // iOS Safari's "environment" camera commonly reports a native
          // stream resolution that isn't square (e.g. 4:3 or 16:9),
          // which html5-qrcode then stretches non-uniformly into our
          // square container. Requesting a 1:1 aspect ratio directly on
          // the camera track fixes the distortion at the source, rather
          // than relying on CSS to visually crop an already-mismatched
          // stream. Passing videoConstraints overrides the first
          // argument above, so facingMode has to be repeated here.
          videoConstraints: { facingMode: "environment", aspectRatio: 1.0 },
        },
        (decodedText) => void handleScan(decodedText),
        () => {},
      );
    } catch {
      toast.error(t("scanner.cameraError"));
      setScanning(false);
    }
  };

  const stop = async () => {
    try {
      await scannerRef.current?.stop();
    } catch {
      // already stopped
    }
    setScanning(false);
  };

  const handleScan = async (decodedText: string) => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      const payload = JSON.parse(decodedText) as {
        token?: string;
        id?: string;
        guest?: boolean;
        exam?: boolean;
      };
      // v2 student passes carry a rotating boarding_token; guest/exam
      // passes still use their own static per-booking token under `id`.
      if (!payload.token && !payload.id) throw new Error("bad payload");

      if (payload.token) {
        lastScanRef.current = { token: payload.token, slot };
      }

      // Server does everything atomically: staff check, booking lookup,
      // scan log, and trip deduction for package students. The client
      // never decides "is this booked" itself.
      const { data, error } = await supabase.functions.invoke("scan-pass", {
        body: payload.guest
          ? { guest_token: payload.id }
          : payload.exam
            ? { exam_token: payload.id }
            : {
                boarding_token: payload.token,
                slot,
                service_date: dateOverride || undefined,
              },
      });

      if (error || data?.error) {
        toast.error(
          data?.error ?? (await edgeFunctionErrorMessage(error, t("scanner.scanFailed"))),
        );
        return;
      }

      setResult({
        status: data.status as ScanStatus,
        fullName: data.full_name,
        route: data.route,
        photoUrl: data.photo_url,
        tripsRemaining: data.trips_remaining ?? null,
        tripsTotal: data.trips_total ?? null,
        hasCompanion: !!data.has_companion,
      });
      if (
        data.status === "booked" &&
        data.trips_remaining !== null &&
        data.trips_remaining !== undefined
      ) {
        toast.success(
          `تم تسجيل الركوب بنجاح! المتبقي: ${data.trips_remaining}/${data.trips_total} رحلة 🟢`,
        );
      } else if (data.status === "no_trips_left") {
        toast.error(`عفواً، استنفذ الطالب جميع الرحلات (0/${data.trips_total}) 🔴`, {
          duration: 10000,
        });
      }
      if (payload.exam && data.status === "booked") {
        void loadScannedCount();
      }
    } catch {
      toast.error(t("scanner.unrecognizedQr"));
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 1500);
    }
  };

  const handleOverride = async () => {
    if (!lastScanRef.current) return;
    setOverriding(true);
    try {
      const { data, error } = await supabase.rpc("scan_pass_override", {
        p_token: lastScanRef.current.token,
        p_slot: lastScanRef.current.slot,
      });

      if (error || (data as { error?: string })?.error) {
        toast.error(
          (data as { error?: string })?.error ?? error?.message ?? t("scanner.scanFailed"),
        );
        return;
      }

      const result = data as {
        status: ScanStatus;
        full_name: string;
        route: string | null;
        photo_url: string | null;
        trips_remaining: number | null;
        trips_total: number | null;
        override?: boolean;
      };

      setResult((prev) => ({
        status: result.status,
        fullName: result.full_name,
        route: result.route,
        photoUrl: result.photo_url,
        tripsRemaining: result.trips_remaining ?? null,
        tripsTotal: result.trips_total ?? null,
        hasCompanion: prev?.hasCompanion ?? false,
        override: !!result.override,
      }));
      toast.success(
        `تم تسجيل الركوب بنجاح! المتبقي: ${result.trips_remaining}/${result.trips_total} رحلة 🟢`,
      );
    } finally {
      setOverriding(false);
    }
  };

  const logWalkIn = async (route: string, kind: "morning" | "return") => {
    setWalkInBusy(true);
    try {
      // A walk-in is a real-time boarding log, not a booking — it must
      // mirror scan_pass()'s own stamp (always the actual current Cairo
      // calendar date, no cutoff widening) so it lands in the same
      // service_date bucket fleet_manifest_report() and real QR scans
      // use. routeDashboardDefaultDate() is for booking dashboards; it
      // rolls to TOMORROW after noon, which silently misdated morning
      // walk-ins logged in the afternoon/evening and made them vanish
      // from that day's Fleet Allocation counter.
      const serviceDate = toDateKey(cairoNow());
      const { data, error } = await supabase.rpc("log_walk_in_passenger", {
        p_route: route,
        p_slot: slot,
        p_kind: kind,
        p_service_date: serviceDate,
        p_note: walkInNote.trim() || null,
      });

      if (error || (data as { error?: string })?.error) {
        toast.error(
          (data as { error?: string })?.error ?? error?.message ?? t("scanner.walkInFailed"),
        );
        return;
      }

      toast.success(`+1 راكب يدوي — ${route}`);
      setWalkInDialogOpen(false);
      setWalkInRoute("");
      setWalkInNote("");
    } finally {
      setWalkInBusy(false);
    }
  };

  const handleWalkInClick = () => {
    if (isMorningSlot && canUseOwnRouteForMorning) {
      void logWalkIn(profile!.assigned_route!, "morning");
      return;
    }
    setWalkInRoute(routes[0] ?? "");
    setWalkInDialogOpen(true);
  };

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-gilded p-4 text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          {t("summer.scannedToday")}
        </p>
        <p className="text-gilded mt-1 text-2xl font-bold">
          {scannedToday === null ? "…" : scannedToday}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Label>{t("scanner.checkingSlot")}</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              disabled={scanning}
            >
              {ALL_SLOTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <Button
              className={scanning ? "" : "btn-gold"}
              variant={scanning ? "destructive" : "default"}
              onClick={() => void (scanning ? stop() : start())}
            >
              <ScanLine className="size-4" />{" "}
              {scanning ? t("scanner.stopScanner") : t("scanner.startScanner")}
            </Button>
          </div>

          <Button
            variant="outline"
            className="mt-3 w-full border-dashed"
            disabled={walkInBusy}
            onClick={handleWalkInClick}
          >
            <UserPlus className="size-4" /> {t("scanner.addWalkIn")}
          </Button>

          {isAdmin && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Label>{t("scanner.testDateOverride")}</Label>
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={dateOverride}
                onChange={(e) => setDateOverride(e.target.value)}
                disabled={scanning}
              />
              {dateOverride && (
                <Button size="sm" variant="ghost" onClick={() => setDateOverride("")}>
                  {t("scanner.resetToToday")} ({todayKey})
                </Button>
              )}
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/50">
            <div id={SCANNER_ELEMENT_ID} className="mx-auto aspect-square max-w-sm" />
            {!scanning && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {t("scanner.pointCamera")}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-semibold">{t("scanner.lastScan")}</h2>
          {!result ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("scanner.noScansYet")}</p>
          ) : (
            <ResultCard
              result={result}
              t={t}
              onOverride={() => void handleOverride()}
              overriding={overriding}
            />
          )}
        </section>
      </div>

      <Dialog open={walkInDialogOpen} onOpenChange={setWalkInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("scanner.walkInDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={walkInRoute}
              onChange={(e) => setWalkInRoute(e.target.value)}
            >
              {routes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Input
              placeholder={t("scanner.walkInNote")}
              value={walkInNote}
              onChange={(e) => setWalkInNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              className="btn-gold w-full"
              disabled={!walkInRoute || walkInBusy}
              onClick={() => void logWalkIn(walkInRoute, isMorningSlot ? "morning" : "return")}
            >
              {walkInBusy ? "…" : t("scanner.walkInConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultCard({
  result,
  t,
  onOverride,
  overriding,
}: {
  result: ScanResult;
  t: (key: string) => string;
  onOverride: () => void;
  overriding: boolean;
}) {
  const config: Record<
    ScanStatus,
    { label: string; className: string; icon: typeof CheckCircle2 }
  > = {
    booked: {
      label: t("scanner.booked"),
      className: "bg-success text-success-foreground",
      icon: CheckCircle2,
    },
    not_booked: {
      label: t("scanner.notBooked"),
      className: "bg-destructive text-destructive-foreground",
      icon: XCircle,
    },
    scanned_earlier: {
      label: t("scanner.scannedEarlier"),
      className: "bg-warning text-warning-foreground",
      icon: ScanLine,
    },
    no_trips_left: {
      label: t("scanner.noTripsLeft"),
      className: "bg-destructive text-destructive-foreground",
      icon: XCircle,
    },
  };
  const c = config[result.status];
  const Icon = c.icon;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-border p-5">
        <div className="size-16 shrink-0 overflow-hidden rounded-xl border-gilded">
          <SmartAvatar
            photoUrl={result.photoUrl}
            name={result.fullName}
            className="size-full text-xl"
          />
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold">{result.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {result.route ?? "—"}
            {result.tripsRemaining !== null &&
              ` · ${result.tripsRemaining}${result.tripsTotal !== null ? `/${result.tripsTotal}` : ""} ${t("scanner.tripsLeft")}`}
          </p>
        </div>
        <Badge className={c.className}>
          <Icon className="me-1 size-3.5" /> {c.label}
        </Badge>
      </div>
      {result.hasCompanion && (
        <Badge className="bg-success text-success-foreground w-full justify-center py-2 text-sm">
          <Users className="me-1 size-4" /> {t("scanner.companionAllowed")}
        </Badge>
      )}
      {result.override && (
        <Badge className="w-full justify-center bg-amber-500 py-2 text-sm text-white">
          {t("scanner.manualOverride")}
        </Badge>
      )}
      {result.status === "not_booked" && (
        <Button className="w-full" variant="outline" disabled={overriding} onClick={onOverride}>
          {overriding ? "…" : t("scanner.checkinAnyway")}
        </Button>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-muted-foreground">{children}</span>;
}
