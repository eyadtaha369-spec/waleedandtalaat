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
import { ALL_SLOTS } from "@/lib/schedule";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";

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

const schema = z.object({
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
});

function DailyPass() {
  const { t, lang } = useLanguage();
  const { routes, stopsByRoute } = useRoutes();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    route: "",
    pickup_stop: "",
    slot: ALL_SLOTS[0] as string,
  });
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

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]!.message);
    setBusy(true);
    const { error } = await supabase.from("daily_pass_requests").insert(parsed.data);
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
              </p>
            </div>
            <Button variant="ghost" className="mt-5" onClick={() => setSent(false)}>
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
                <Label>{t("dailyPass.pickupStop")}</Label>
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
                <Label>{t("dailyPass.timeSlot")}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.slot}
                  onChange={(e) => setForm({ ...form, slot: e.target.value })}
                >
                  {ALL_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {formatSlotLabel(s, lang)}
                    </option>
                  ))}
                </select>
              </div>
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
