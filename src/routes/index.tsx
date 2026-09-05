import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BusFront, QrCode, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ExamBookingModal } from "@/components/ExamBookingModal";
import { MORNING_SLOTS, RETURN_SLOTS } from "@/lib/schedule";

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

const features = [
  {
    icon: Ticket,
    title: "Two booking windows",
    body: "Morning seats open 12:00 PM–7:00 PM the day before. Early returns open 6:30 AM–10:30 AM.",
  },
  {
    icon: QrCode,
    title: "Digital boarding pass",
    body: "A live QR pass with your photo, route, package counter and today's booking status.",
  },
  {
    icon: ShieldCheck,
    title: "Supervisor control",
    body: "Camera scanning, per-slot manifests, daily pass approvals and bulk student import.",
  },
];

function Index() {
  const [examModalOpen, setExamModalOpen] = useState(false);
  return (
    <main>
      <section className="surface-navy relative overflow-hidden">
        <div className="absolute -end-24 -top-24 size-96 rounded-full bg-[var(--gold)] opacity-15 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <span className="border-gilded inline-flex rounded-full px-4 py-1.5 text-xs tracking-[0.25em] uppercase">
              Alexandria ⇄ Alamein
            </span>
            <h1 className="mt-6 text-4xl leading-tight font-bold md:text-6xl">
              The <span className="text-gilded">executive</span> student shuttle,
              <br /> booked in seconds.
            </h1>
            <p className="mt-5 max-w-lg text-sm opacity-80 md:text-base">
              وليد وطلعت — daily transportation for students of Alamein International University,
              with reserved seats, verified boarding and a supervisor dashboard built for the road.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setExamModalOpen(true)}
                className="animate-pulse rounded-2xl bg-gradient-to-r from-[var(--gold)] to-amber-400 px-6 py-4 text-lg font-bold text-black shadow-lg transition-transform hover:scale-105"
              >
                حجز أيام الامتحانات 📝
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="btn-gold">
                  Student sign in
                </Button>
              </Link>
              <Link to="/daily-pass">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-gilded bg-transparent text-inherit hover:bg-white/10"
                >
                  Request a daily pass
                </Button>
              </Link>
            </div>
          </div>
          <div className="justify-self-center">
            <div className="border-gilded shadow-luxe rounded-3xl bg-white/5 p-8 backdrop-blur">
              <Logo size={140} />
              <div className="mt-6 space-y-3 text-sm">
                <Row label="Morning departures" value={MORNING_SLOTS.join("  •  ")} />
                <Row label="Early returns" value={RETURN_SLOTS.join("  •  ")} />
                <Row label="Standard return" value="04:00 PM — no booking" />
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
          <span>Waleed &amp; Talaat Student Transportation — وليد وطلعت</span>
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
