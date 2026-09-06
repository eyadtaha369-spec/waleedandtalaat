import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BusFront, QrCode, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ExamBookingModal } from "@/components/ExamBookingModal";
import { MORNING_SLOTS, RETURN_SLOTS } from "@/lib/schedule";
import { useLanguage } from "@/hooks/useLanguage";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";

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
  const [examModalOpen, setExamModalOpen] = useState(false);
  const { t, lang } = useLanguage();

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
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setExamModalOpen(true)}
                className="animate-pulse rounded-2xl bg-gradient-to-r from-[var(--gold)] to-amber-400 px-6 py-4 text-lg font-bold text-black shadow-lg transition-transform hover:scale-105"
              >
                {t("landing.examCta")}
              </button>
            </div>
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

      <ExamBookingModal open={examModalOpen} onOpenChange={setExamModalOpen} />
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
