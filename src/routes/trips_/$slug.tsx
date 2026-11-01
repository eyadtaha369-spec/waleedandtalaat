import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CAIRO_TRIP_COVER,
  EGYPT_MOBILE_REGEX,
  LEAD_NAME_MIN_WORDS,
  OTHER_NAME_MIN_WORDS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatTripDate,
  normalizeDigits,
  wordCount,
  type TripPackageType,
  type TripPaymentMethod,
} from "@/lib/tourismTrips";

export const Route = createFileRoute("/trips_/$slug")({
  head: () => ({
    meta: [
      { title: "رحلات سياحية — Waleed & Talaat" },
      { name: "description", content: "احجز مكانك في رحلاتنا السياحية." },
      { property: "og:title", content: "رحلات سياحية — Waleed & Talaat" },
      { property: "og:description", content: "احجز مكانك في رحلاتنا السياحية." },
      { property: "og:image", content: CAIRO_TRIP_COVER },
    ],
  }),
  component: TripBookingPage,
});

type TripRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  trip_date: string;
  price_per_person: number;
  friends_price: number;
  friends_group_size: number;
  payment_instructions: string | null;
  terms: string[];
};

type PassengerForm = { fullName: string; phone: string };

const emptyPassenger: PassengerForm = { fullName: "", phone: "" };

function TripBookingPage() {
  const { t, lang } = useLanguage();
  const { slug } = Route.useParams();
  const [trip, setTrip] = useState<TripRow | null | undefined>(undefined);

  const [agreeChecked, setAgreeChecked] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [packageType, setPackageType] = useState<TripPackageType>("standard");
  const [standardPassenger, setStandardPassenger] = useState<PassengerForm>(emptyPassenger);
  const [friendsPassengers, setFriendsPassengers] = useState<PassengerForm[]>(
    Array.from({ length: 5 }, () => ({ ...emptyPassenger })),
  );
  const [senderPhone, setSenderPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<TripPaymentMethod>("instapay");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    void supabase
      .from("tourism_trips")
      .select(
        "id,slug,title,subtitle,trip_date,price_per_person,friends_price,friends_group_size,payment_instructions,terms",
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => setTrip((data as TripRow | null) ?? null));
  }, [slug]);

  const updateFriendPassenger = (index: number, field: keyof PassengerForm, value: string) => {
    setFriendsPassengers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const submit = async () => {
    if (!trip) return;
    const passengers = packageType === "standard" ? [standardPassenger] : friendsPassengers;

    if (!receiptFile) {
      toast.error(t("tourismTrip.chooseReceiptFirst"));
      return;
    }
    if (!receiptFile.type.startsWith("image/")) {
      toast.error(t("tourismTrip.receiptNotImage"));
      return;
    }
    if (receiptFile.size > 8 * 1024 * 1024) {
      toast.error(t("tourismTrip.receiptTooLarge"));
      return;
    }

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i]!;
      const minWords = i === 0 ? LEAD_NAME_MIN_WORDS : OTHER_NAME_MIN_WORDS;
      if (wordCount(p.fullName) < minWords) {
        toast.error(i === 0 ? t("tourismTrip.leadNameTooShort") : t("tourismTrip.nameTooShort"));
        return;
      }
      if (!EGYPT_MOBILE_REGEX.test(normalizeDigits(p.phone).replace(/\D/g, ""))) {
        toast.error(t("tourismTrip.phoneInvalid"));
        return;
      }
    }
    if (!EGYPT_MOBILE_REGEX.test(normalizeDigits(senderPhone).replace(/\D/g, ""))) {
      toast.error(t("tourismTrip.phoneInvalid"));
      return;
    }

    setBusy(true);
    const ext = receiptFile.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("trip-receipts")
      .upload(path, receiptFile);
    if (uploadError) {
      setBusy(false);
      toast.error(t("tourismTrip.uploadFailed"));
      return;
    }

    const { error } = await supabase.rpc("submit_trip_booking", {
      p_trip_id: trip.id,
      p_package: packageType,
      p_sender_phone: normalizeDigits(senderPhone),
      p_payment_method: paymentMethod,
      p_receipt_path: path,
      p_passengers: passengers.map((p) => ({
        full_name: p.fullName.trim(),
        phone: normalizeDigits(p.phone),
      })),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || t("tourismTrip.errorGeneric"));
      return;
    }
    setSent(true);
  };

  if (trip === undefined) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  if (trip === null) {
    return (
      <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-center text-card-foreground">
          <Hourglass className="text-accent mx-auto size-10" />
          <h1 className="mt-4 text-xl font-bold">{t("tourismTrip.notFound")}</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-64px)]">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted sm:aspect-[16/9]">
          <img
            src={CAIRO_TRIP_COVER}
            alt="رحلة القاهرة"
            fetchPriority="high"
            onLoad={() => setHeroLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              heroLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{ objectPosition: "center 60%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h1 className="text-2xl font-bold drop-shadow-lg sm:text-3xl">{trip.title}</h1>
            {trip.subtitle && (
              <p className="mt-1 text-sm opacity-90 drop-shadow-lg">{trip.subtitle}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold drop-shadow-lg">
              <span>{formatTripDate(trip.trip_date, lang)}</span>
              <span className="opacity-60">•</span>
              <span>
                {trip.price_per_person} {t("common.egp")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {sent ? (
          <div className="shadow-luxe rounded-3xl bg-card p-8 text-center text-card-foreground">
            <CheckCircle2 className="text-success mx-auto size-10" />
            <h2 className="mt-4 text-xl font-bold">{t("tourismTrip.successTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("tourismTrip.successBody")}</p>
          </div>
        ) : (
          <div className="shadow-luxe space-y-5 rounded-3xl bg-card p-6 text-card-foreground">
            <div className="space-y-2">
              <Label>{t("tourismTrip.packageTitle")}</Label>
              <RadioGroup
                value={packageType}
                onValueChange={(v) => setPackageType(v as TripPackageType)}
                className="grid gap-3"
              >
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${
                    packageType === "standard" ? "border-accent bg-accent/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value="standard" />
                  <span className="font-semibold">
                    {t("tourismTrip.packageStandardTitle")} - {trip.price_per_person}{" "}
                    {t("common.egp")}
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${
                    packageType === "friends" ? "border-accent bg-accent/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value="friends" />
                  <span className="font-semibold">
                    {t("tourismTrip.packageFriendsTitle")} -{" "}
                    {t("tourismTrip.packageFriendsTotalPrefix")} {trip.friends_price}{" "}
                    {t("common.egp")} {t("tourismTrip.packageFriendsForLabel")}{" "}
                    {trip.friends_group_size} {t("tourismTrip.packageFriendsTotalSuffix")}
                  </span>
                </label>
              </RadioGroup>
            </div>

            {packageType === "standard" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("tourismTrip.fullNameLabel")}</Label>
                  <Input
                    value={standardPassenger.fullName}
                    onChange={(e) =>
                      setStandardPassenger((p) => ({ ...p, fullName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("tourismTrip.phoneLabel")}</Label>
                  <Input
                    inputMode="tel"
                    value={standardPassenger.phone}
                    onChange={(e) =>
                      setStandardPassenger((p) => ({
                        ...p,
                        phone: normalizeDigits(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {t("tourismTrip.friendsWarningPrefix")} ({trip.friends_price} {t("common.egp")}){" "}
                  {t("tourismTrip.friendsWarningSuffix")}
                </div>
                <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 text-sm">
                  {t("tourismTrip.friendsInfoNote")}
                </div>
                {friendsPassengers.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {i === 0
                        ? t("tourismTrip.leadPersonLabel")
                        : `${t("tourismTrip.passengerLabel")} ${i + 1}`}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("tourismTrip.fullNameLabel")}</Label>
                        <Input
                          value={p.fullName}
                          onChange={(e) => updateFriendPassenger(i, "fullName", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("tourismTrip.phoneLabel")}</Label>
                        <Input
                          inputMode="tel"
                          value={p.phone}
                          onChange={(e) =>
                            updateFriendPassenger(i, "phone", normalizeDigits(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("tourismTrip.senderPhoneLabel")}</Label>
              <Input
                inputMode="tel"
                value={senderPhone}
                onChange={(e) => setSenderPhone(normalizeDigits(e.target.value))}
              />
            </div>

            {trip.payment_instructions && (
              <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 text-sm">
                {trip.payment_instructions}
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("tourismTrip.paymentMethodLabel")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      paymentMethod === m
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("tourismTrip.receiptUploadLabel")}</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <Button
              className="btn-gold w-full"
              disabled={busy || !termsAccepted}
              onClick={() => void submit()}
            >
              {busy ? t("tourismTrip.submitting") : t("tourismTrip.submit")}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!termsAccepted && !sent} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tourismTrip.termsTitle")}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {trip.terms.map((term, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>{term}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="trip-terms-agree"
              checked={agreeChecked}
              onCheckedChange={(v) => setAgreeChecked(!!v)}
            />
            <Label htmlFor="trip-terms-agree">{t("tourismTrip.termsAgree")}</Label>
          </div>
          <DialogFooter>
            <Button
              className="btn-gold w-full"
              disabled={!agreeChecked}
              onClick={() => setTermsAccepted(true)}
            >
              {t("tourismTrip.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
