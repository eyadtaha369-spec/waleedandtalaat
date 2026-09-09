import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { CheckCircle2, ScanLine, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_SLOTS, cairoNow, toDateKey } from "@/lib/schedule";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

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
};

export function ScannerPanel() {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [dateOverride, setDateOverride] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scannedToday, setScannedToday] = useState<number | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);
  const todayKey = toDateKey(cairoNow());

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
        { fps: 10, qrbox: 250 },
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
      const payload = JSON.parse(decodedText) as { id?: string; guest?: boolean; exam?: boolean };
      if (!payload.id) throw new Error("bad payload");

      // Server does everything atomically: staff check, booking lookup,
      // scan log, and trip deduction for package students. The client
      // never decides "is this booked" itself.
      const { data, error } = await supabase.functions.invoke("scan-pass", {
        body: payload.guest
          ? { guest_token: payload.id }
          : payload.exam
            ? { exam_token: payload.id }
            : { student_id: payload.id, slot, service_date: dateOverride || undefined },
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
            <ResultCard result={result} t={t} />
          )}
        </section>
      </div>
    </div>
  );
}

function ResultCard({ result, t }: { result: ScanResult; t: (key: string) => string }) {
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
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-muted-foreground">{children}</span>;
}
