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

const SCANNER_ELEMENT_ID = "wt-qr-scanner";

type ScanStatus = "booked" | "not_booked" | "scanned_earlier";

type ScanResult = {
  status: ScanStatus;
  fullName: string;
  route: string | null;
  photoUrl: string | null;
  tripsRemaining: number | null;
  hasCompanion: boolean;
};

export function ScannerPanel() {
  const { isAdmin } = useAuth();
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [dateOverride, setDateOverride] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);
  const todayKey = toDateKey(cairoNow());

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
      toast.error("Could not access the camera. Check permissions and try again.");
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
        toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, "Scan failed")));
        return;
      }

      setResult({
        status: data.status as ScanStatus,
        fullName: data.full_name,
        route: data.route,
        photoUrl: data.photo_url,
        tripsRemaining: data.trips_remaining ?? null,
        hasCompanion: !!data.has_companion,
      });
    } catch {
      toast.error("Unrecognized QR code.");
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 1500);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Label>Checking against slot</Label>
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
            <ScanLine className="size-4" /> {scanning ? "Stop scanner" : "Start scanner"}
          </Button>
        </div>

        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Label>Test date override (admin only)</Label>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={dateOverride}
              onChange={(e) => setDateOverride(e.target.value)}
              disabled={scanning}
            />
            {dateOverride && (
              <Button size="sm" variant="ghost" onClick={() => setDateOverride("")}>
                Reset to today ({todayKey})
              </Button>
            )}
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/50">
          <div id={SCANNER_ELEMENT_ID} className="mx-auto aspect-square max-w-sm" />
          {!scanning && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Press "Start scanner" and point the camera at a student's boarding pass QR code.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">Last scan</h2>
        {!result ? (
          <p className="mt-4 text-sm text-muted-foreground">No scans yet this session.</p>
        ) : (
          <ResultCard result={result} />
        )}
      </section>
    </div>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  const config: Record<
    ScanStatus,
    { label: string; className: string; icon: typeof CheckCircle2 }
  > = {
    booked: {
      label: "Booked",
      className: "bg-success text-success-foreground",
      icon: CheckCircle2,
    },
    not_booked: {
      label: "Not booked",
      className: "bg-destructive text-destructive-foreground",
      icon: XCircle,
    },
    scanned_earlier: {
      label: "Scanned earlier",
      className: "bg-warning text-warning-foreground",
      icon: ScanLine,
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
            {result.tripsRemaining !== null && ` · ${result.tripsRemaining} trips left`}
          </p>
        </div>
        <Badge className={c.className}>
          <Icon className="me-1 size-3.5" /> {c.label}
        </Badge>
      </div>
      {result.hasCompanion && (
        <Badge className="bg-success text-success-foreground w-full justify-center py-2 text-sm">
          <Users className="me-1 size-4" /> 👥 مسموح بركوب مرافق (تم سداد 250 ج)
        </Badge>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-muted-foreground">{children}</span>;
}
