import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cairoNow, toDateKey } from "@/lib/schedule";
import { useLanguage } from "@/hooks/useLanguage";

type EarlyReturnSlotRow = {
  slot: string;
  total_booked: number;
  qr_scanned: number;
  walk_in_count: number;
  total_onboard: number;
};

type MorningRouteRow = {
  route: string;
  slot: string;
  total_booked: number;
  qr_scanned: number;
  walk_in_count: number;
  total_onboard: number;
};

const EARLY_RETURN_SLOT_LABELS: Record<string, string> = {
  "08:00 AM": "08:00 AM (Alexandria Mix)",
  "09:00 AM": "09:00 AM (Borg El-Arab)",
};

function useManifestDate() {
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [date, setDate] = useState<string>(todayKey);
  return { date, setDate, todayKey };
}

function DatePicker({
  date,
  setDate,
  todayKey,
}: {
  date: string;
  setDate: (d: string) => void;
  todayKey: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium text-muted-foreground" htmlFor="manifest-summary-date">
        {t("manifests.date")}
      </label>
      <input
        id="manifest-summary-date"
        type="date"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {date !== todayKey && (
        <button
          type="button"
          className="text-xs text-accent underline underline-offset-2"
          onClick={() => setDate(todayKey)}
        >
          {t("manifests.resetToday")} ({todayKey})
        </button>
      )}
    </div>
  );
}

export function EarlyReturnsPanel() {
  const { t } = useLanguage();
  const { date, setDate, todayKey } = useManifestDate();
  const [rows, setRows] = useState<EarlyReturnSlotRow[]>([]);

  const load = async (currentDate: string) => {
    const { data } = await supabase.rpc("get_early_return_slot_summary", { p_date: currentDate });
    setRows(data ?? []);
  };

  useEffect(() => {
    void load(date);
    const channel = supabase
      .channel(`early-return-summary-${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `service_date=eq.${date}` },
        () => void load(date),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opt_outs", filter: `service_date=eq.${date}` },
        () => void load(date),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `service_date=eq.${date}` },
        () => void load(date),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walk_in_passengers",
          filter: `service_date=eq.${date}`,
        },
        () => void load(date),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [date]);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <DatePicker date={date} setDate={setDate} todayKey={todayKey} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("manifests.noPassengers")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("manifests.timeSlot")}</TableHead>
                <TableHead>{t("manifests.totalBooked")}</TableHead>
                <TableHead>{t("manifests.qrScanned")}</TableHead>
                <TableHead>{t("manifests.walkInCount")}</TableHead>
                <TableHead>{t("manifests.totalOnboard")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.slot}>
                  <TableCell className="font-medium">
                    {EARLY_RETURN_SLOT_LABELS[r.slot] ?? r.slot}
                  </TableCell>
                  <TableCell>{r.total_booked}</TableCell>
                  <TableCell>{r.qr_scanned}</TableCell>
                  <TableCell>{r.walk_in_count}</TableCell>
                  <TableCell className="font-semibold">{r.total_onboard}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export function MorningDeparturePanel() {
  const { t } = useLanguage();
  const { date, setDate, todayKey } = useManifestDate();
  const [rows, setRows] = useState<MorningRouteRow[]>([]);

  const load = async (currentDate: string) => {
    const { data } = await supabase.rpc("get_morning_departure_route_summary", {
      p_date: currentDate,
    });
    setRows(data ?? []);
  };

  useEffect(() => {
    void load(date);
    const channel = supabase
      .channel(`morning-departure-summary-${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `service_date=eq.${date}` },
        () => void load(date),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walk_in_passengers",
          filter: `service_date=eq.${date}`,
        },
        () => void load(date),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [date]);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <DatePicker date={date} setDate={setDate} todayKey={todayKey} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("manifests.noPassengers")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("manifests.booked")}</TableHead>
                <TableHead>{t("manifests.timeSlot")}</TableHead>
                <TableHead>{t("manifests.qrScanned")}</TableHead>
                <TableHead>{t("manifests.walkInCount")}</TableHead>
                <TableHead>{t("manifests.totalOnboard")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.route}-${r.slot}`}>
                  <TableCell className="font-medium">{r.route}</TableCell>
                  <TableCell>{r.total_booked}</TableCell>
                  <TableCell>{r.slot}</TableCell>
                  <TableCell>{r.qr_scanned}</TableCell>
                  <TableCell>{r.walk_in_count}</TableCell>
                  <TableCell className="font-semibold">{r.total_onboard}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
