import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_SLOTS, cairoNow, MORNING_SLOTS, toDateKey } from "@/lib/schedule";

const SCANNER_ELEMENT_ID = "wt-qr-scanner";

type ScanStatus = "booked" | "not_booked" | "scanned_earlier";

type ScanResult = {
  status: ScanStatus;
  fullName: string;
  route: string | null;
  photoUrl: string | null;
};

export function ScannerPanel() {
  const { user } = useAuth();
  const [slot, setSlot] = useState<string>(ALL_SLOTS[0]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

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
    if (lockRef.current || !user) return;
    lockRef.current = true;

    try {
      const payload = JSON.parse(decodedText) as { id?: string };
      if (!payload.id) throw new Error("bad payload");

      const today = toDateKey(cairoNow());

      const [{ data: profile }, { data: priorScans }, { data: optOut }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,route,photo_url")
          .eq("id", payload.id)
          .maybeSingle(),
        supabase.from("scans").select("id").eq("student_id", payload.id).eq("service_date", today),
        supabase
          .from("opt_outs")
          .select("id")
          .eq("student_id", payload.id)
          .eq("service_date", today),
      ]);

      if (!profile) {
        toast.error("No student found for this QR code.");
        lockRef.current = false;
        return;
      }

      const alreadyScanned = (priorScans ?? []).length > 0;

      let isBooked = false;
      if (slot === "04:00 PM") {
        isBooked = (optOut ?? []).length === 0;
      } else {
        const kind = (MORNING_SLOTS as readonly string[]).includes(slot) ? "morning" : "return";
        const { data: booking } = await supabase
          .from("bookings")
          .select("id")
          .eq("student_id", payload.id)
          .eq("service_date", today)
          .eq("kind", kind)
          .eq("slot", slot)
          .maybeSingle();
        isBooked = !!booking;
      }

      await supabase.from("scans").insert({
        student_id: payload.id,
        scanned_by: user.id,
        service_date: today,
        slot,
      });

      setResult({
        status: alreadyScanned ? "scanned_earlier" : isBooked ? "booked" : "not_booked",
        fullName: profile.full_name,
        route: profile.route,
        photoUrl: profile.photo_url,
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
    <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border p-5">
      {result.photoUrl ? (
        <img
          src={result.photoUrl}
          alt={result.fullName}
          className="size-16 rounded-xl border-gilded object-cover"
        />
      ) : (
        <div className="border-gilded flex size-16 items-center justify-center rounded-xl bg-secondary text-xl font-bold">
          {result.fullName.charAt(0)}
        </div>
      )}
      <div className="flex-1">
        <p className="text-lg font-bold">{result.fullName}</p>
        <p className="text-sm text-muted-foreground">{result.route ?? "—"}</p>
      </div>
      <Badge className={c.className}>
        <Icon className="me-1 size-3.5" /> {c.label}
      </Badge>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-muted-foreground">{children}</span>;
}
