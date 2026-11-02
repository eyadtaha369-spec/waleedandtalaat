import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BusFront, QrCode, ShieldCheck, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { MORNING_SLOTS, RETURN_SLOTS } from "@/lib/schedule";
import { useLanguage } from "@/hooks/useLanguage";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";
import { CAIRO_TRIP_COVER, formatTripDate } from "@/lib/tourismTrips";

const CAIRO_TRIP_SLUG = "cairo-2026-11-21";

type CairoTripBanner = { trip_date: string; price_per_person: number };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Waleed & Talaat — Alexandria ⇄ Alamein Student Shuttle" },
      {
        name: "description",
        content:
          "Book your morning and return seat, show a digital boarding pass, and let supervisors scan you on board. Alexandria to Alamein International University.",
      },
      { property: "og:title", content: "Waleed & Talaat — Executive Student Shuttle" },
      {
        property: "og:description",
        content: "Daily shuttle booking between Alexandria and Alamein International University.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang } = useLanguage();
  const [tripBannerLoaded, setTripBannerLoaded] = useState(false);
  const [cairoTrip, setCairoTrip] = useState<CairoTripBanner | null>(null);

  useEffect(() => {
    void supabase
      .from("tourism_trips")
      .select("trip_date,price_per_person")
      .eq("slug", CAIRO_TRIP_SLUG)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => setCairoTrip((data as CairoTripBanner | null) ?? null));
  }, []);

  const features = [
    { icon: Ticket, title: t("landing.feature1Title"), body: t("landing.feature1Body") },
    { icon: QrCode, title: t("landing.feature2Title"), body: t("landing.feature2Body") },
    { icon: ShieldCheck, title: t("landing.feature3Title"), body: t("landing.feature3Body") },
  ];

  return (
    <main>
      <section className="surface-navy relative overflow-hidden">
        <div className="absolute -end-24 -top-24 size-96 rounded-full bg-[var(--gold)] opacity-15 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <span className="border-gilded inline-flex rounded-full px-4 py-1.5 text-xs tracking-[0.25em] uppercase">
              {t("landing.tagline")}
            </span>
            <h1 className="mt-6 text-4xl leading-tight font-bold md:text-6xl">
              {t("landing.title1")} <span className="text-gilded">{t("landing.titleGold")}</span>{" "}
              {t("landing.title2")}
            </h1>
            <p className="mt-5 max-w-lg text-sm opacity-80 md:text-base">{t("landing.subtitle")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="btn-gold">
                  {t("landing.studentSignIn")}
                </Button>
              </Link>
              <Link to="/daily-pass">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-gilded bg-transparent text-inherit hover:bg-white/10"
                >
                  {t("landing.requestDailyPass")}
                </Button>
              </Link>
            </div>
          </div>
          <div className="justify-self-center">
            <div className="border-gilded shadow-luxe rounded-3xl bg-white/5 p-8 backdrop-blur">
              <Logo size={140} />
              <div className="mt-6 space-y-3 text-sm">
                <Row
                  label={t("landing.morningDepartures")}
                  value={MORNING_SLOTS.map((s) => formatSlotLabel(s, lang)).join("  •  ")}
                />
                <Row
                  label={t("landing.earlyReturns")}
                  value={RETURN_SLOTS.map((s) => formatSlotLabel(s, lang)).join("  •  ")}
                />
                <Row label={t("landing.standardReturn")} value={t("landing.standardReturnValue")} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-8">
        <Link
          to="/trips/$slug"
          params={{ slug: "cairo-2026-11-21" }}
          className="relative block h-40 overflow-hidden rounded-3xl bg-muted sm:h-48"
        >
          <img
            src={CAIRO_TRIP_COVER}
            alt="رحلة القاهرة"
            fetchPriority="high"
            onLoad={() => setTripBannerLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              tripBannerLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{ objectPosition: "center 60%" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-start justify-end gap-2 p-5 text-white">
            <p className="text-lg font-bold drop-shadow-lg sm:text-xl">
              {t("landing.tourismTripsCta")}
            </p>
            {cairoTrip && (
              <p className="text-sm font-medium opacity-90 drop-shadow-lg">
                {formatTripDate(cairoTrip.trip_date, lang)} · {Number(cairoTrip.price_per_person)}{" "}
                {t("common.egp")}
              </p>
            )}
            <span className="btn-gold mt-1 inline-block rounded-full px-4 py-1.5 text-xs font-semibold">
              {t("landing.tourismTripsBookNow")}
            </span>
          </div>
        </Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <f.icon className="text-accent size-6" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="surface-navy">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-8 text-sm opacity-80">
          <BusFront className="size-5" />
          <span>{t("landing.footer")}</span>
        </div>
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/10 pb-2">
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
