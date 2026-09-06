import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoutes } from "@/hooks/useRoutes";
import { MORNING_SLOTS } from "@/lib/schedule";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";
import { EarlyReturnSector, SECTOR_LABELS, stopsForSector } from "@/lib/earlyReturnSectors";

export const Route = createFileRoute("/daily-pass")({
  head: () => ({
    meta: [
      { title: "Daily pass request — Waleed & Talaat" },
      {
        name: "description",
        content:
          "Not a subscriber? Request a one-day seat on the Alexandria to Alamein shuttle — no account needed.",
      },
      { property: "og:title", content: "Daily pass request — Waleed & Talaat" },
      { property: "og:description", content: "Request a one-day shuttle seat, no account needed." },
    ],
  }),
  component: DailyPass,
});

type TripType = "one_way" | "round_trip";
type PaymentMethod = "cash" | "instapay";

const RETURN_SLOT_CHOICES = ["12:30 PM", "01:30 PM", "02:30 PM", "04:00 PM"];

const baseSchema = {
  full_name: z.string().trim().min(3, "Enter your full name").max(100),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid WhatsApp number")
    .max(20)
    .regex(/^[0-9+\s-]+$/, "Digits only"),
  route: z.string().min(1),
  pickup_stop: z.string().min(1, "Select your pickup stop"),
  slot: z.string().min(1),
};
const schema = z.object(baseSchema);

function DailyPass() {
  const { t, lang } = useLanguage();
  const { routes, stopsByRoute } = useRoutes();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    route: "",
    pickup_stop: "",
    slot: MORNING_SLOTS[0] as string,
  });
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [returnSlot, setReturnSlot] = useState<string>(RETURN_SLOT_CHOICES[0]!);
  const [returnSector, setReturnSector] = useState<EarlyReturnSector | "">("");
  const [returnStop, setReturnStop] = useState<string>("");
  const isFourPmReturn = returnSlot === "04:00 PM";
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!form.route && routes.length > 0) {
      setForm((f) => ({
        ...f,
        route: routes[0]!,
        pickup_stop: stopsByRoute[routes[0]!]?.[0] ?? "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  // When round-trip + 4PM return, the drop-off is locked to the
  // guest's own selected route — same rule as subscribed students.
  useEffect(() => {
    if (isFourPmReturn) {
      setReturnStop(stopsByRoute[form.route]?.[0] ?? "");
    }
  }, [isFourPmReturn, form.route, stopsByRoute]);

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]!.message);

    if (tripType === "round_trip") {
      if (!isFourPmReturn && (!returnSector || !returnStop)) {
        toast.error(t("dailyPass.chooseReturnSectorStop"));
        return;
      }
      if (isFourPmReturn && !returnStop) {
        toast.error(t("dailyPass.chooseReturnStop"));
        return;
      }
    }
    if (paymentMethod === "instapay" && !receiptFile) {
      toast.error(t("dailyPass.receiptRequired"));
      return;
    }

    setBusy(true);

    let receiptPath: string | null = null;
    if (paymentMethod === "instapay" && receiptFile) {
      const ext = receiptFile.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("daily-pass-receipts")
        .upload(path, receiptFile);
      if (uploadError) {
        setBusy(false);
        toast.error(uploadError.message);
        return;
      }
      receiptPath = path;
    }

    const { error } = await supabase.from("daily_pass_requests").insert({
      ...parsed.data,
      trip_type: tripType,
      return_slot: tripType === "round_trip" ? returnSlot : null,
      return_pickup_stop: tripType === "round_trip" ? returnStop : null,
      payment_method: paymentMethod,
      receipt_url: receiptPath,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  return (
    <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-card-foreground">
        {sent ? (
          <div className="text-center">
            <Hourglass className="text-accent mx-auto size-10" />
            <h1 className="mt-4 text-xl font-bold">{t("dailyPass.pendingTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("dailyPass.pendingBody")}</p>
            <div className="mt-6 rounded-2xl border border-border bg-secondary p-4 text-start text-sm">
              <p className="font-semibold">{form.full_name}</p>
              <p className="text-muted-foreground">
                {form.route} · {form.pickup_stop} · {formatSlotLabel(form.slot, lang)}
                {tripType === "round_trip" &&
                  ` · ${formatSlotLabel(returnSlot, lang)} · ${returnStop}`}
              </p>
            </div>
            <Button
              variant="ghost"
              className="mt-5"
              onClick={() => {
                setSent(false);
                setTripType("one_way");
                setPaymentMethod("cash");
                setReceiptFile(null);
                setReturnSector("");
              }}
            >
              {t("dailyPass.submitAnother")}
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{t("dailyPass.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("dailyPass.subtitle")}</p>
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>{t("dailyPass.fullName")}</Label>
                <Input
                  maxLength={100}
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("dailyPass.whatsapp")}</Label>
                <Input
                  maxLength={20}
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("dailyPass.tripType")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTripType("one_way")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      tripType === "one_way"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {t("dailyPass.oneWay")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTripType("round_trip")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      tripType === "round_trip"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {t("dailyPass.roundTrip")}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("dailyPass.route")}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.route}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      route: e.target.value,
                      pickup_stop: stopsByRoute[e.target.value]?.[0] ?? "",
                    })
                  }
                >
                  {routes.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>
                  {tripType === "round_trip"
                    ? t("dailyPass.morningStop")
                    : t("dailyPass.pickupStop")}
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.pickup_stop}
                  onChange={(e) => setForm({ ...form, pickup_stop: e.target.value })}
                >
                  {(stopsByRoute[form.route] ?? []).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>
                  {tripType === "round_trip" ? t("dailyPass.morningSlot") : t("dailyPass.timeSlot")}
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.slot}
                  onChange={(e) => setForm({ ...form, slot: e.target.value })}
                >
                  {MORNING_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {formatSlotLabel(s, lang)}
                    </option>
                  ))}
                </select>
              </div>

              {tripType === "round_trip" && (
                <div className="space-y-4 rounded-xl border border-border p-3">
                  <div className="space-y-2">
                    <Label>{t("dailyPass.returnSlot")}</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={returnSlot}
                      onChange={(e) => {
                        setReturnSlot(e.target.value);
                        setReturnSector("");
                        setReturnStop("");
                      }}
                    >
                      {RETURN_SLOT_CHOICES.map((s) => (
                        <option key={s} value={s}>
                          {formatSlotLabel(s, lang)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isFourPmReturn ? (
                    <div className="space-y-2">
                      <Label>{t("dailyPass.returnStop")}</Label>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={returnStop}
                        onChange={(e) => setReturnStop(e.target.value)}
                      >
                        {(stopsByRoute[form.route] ?? []).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>{t("dailyPass.sector")}</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.keys(SECTOR_LABELS) as EarlyReturnSector[]).map((sector) => (
                            <button
                              key={sector}
                              type="button"
                              onClick={() => {
                                setReturnSector(sector);
                                setReturnStop(stopsForSector(sector)[0] ?? "");
                              }}
                              className={`rounded-md border px-3 py-2 text-sm ${
                                returnSector === sector
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-input bg-background"
                              }`}
                            >
                              {SECTOR_LABELS[sector]}
                            </button>
                          ))}
                        </div>
                      </div>
                      {returnSector && (
                        <div className="space-y-2">
                          <Label>{t("dailyPass.returnStop")}</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={returnStop}
                            onChange={(e) => setReturnStop(e.target.value)}
                          >
                            {stopsForSector(returnSector).map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("dailyPass.paymentMethod")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      paymentMethod === "cash"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {t("dailyPass.cash")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("instapay")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      paymentMethod === "instapay"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {t("dailyPass.instapay")}
                  </button>
                </div>
              </div>

              {paymentMethod === "instapay" && (
                <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/15 p-3">
                  <p className="text-sm font-medium">{t("dailyPass.instapayNotice")}</p>
                  <div className="space-y-2">
                    <Label>{t("dailyPass.receiptUpload")}</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              )}

              <Button className="btn-gold w-full" disabled={busy} onClick={() => void submit()}>
                <CheckCircle2 className="size-4" /> {t("dailyPass.submit")}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
