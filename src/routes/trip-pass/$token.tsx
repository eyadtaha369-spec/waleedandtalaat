import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Hourglass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/useLanguage";
import { formatTripDate, type TripPackageType } from "@/lib/tourismTrips";

export const Route = createFileRoute("/trip-pass/$token")({
  head: () => ({
    meta: [
      { title: "تذكرة الرحلة — Waleed & Talaat" },
      { name: "description", content: "تذكرة الرحلة السياحية الخاصة بك." },
    ],
  }),
  component: TripPassPage,
});

type TripPass = {
  title: string;
  trip_date: string;
  package_type: TripPackageType;
  pass_token: string;
  passengers: { position: number; full_name: string }[];
};

type Status = "loading" | "ready" | "not_found" | "fetch_error";

function TripPassPage() {
  const { t, lang } = useLanguage();
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [pass, setPass] = useState<TripPass | null>(null);

  const load = async () => {
    setStatus("loading");
    try {
      const { data, error } = await supabase.rpc("get_trip_pass", { p_token: token });
      if (error) {
        setStatus("fetch_error");
        return;
      }
      const result = data as (TripPass & { error?: string }) | null;
      if (!result || result.error) {
        setStatus("not_found");
        return;
      }
      setPass(result);
      setStatus("ready");
    } catch {
      setStatus("fetch_error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "not_found") {
    return (
      <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-center text-card-foreground">
          <Hourglass className="text-accent mx-auto size-10" />
          <h1 className="mt-4 text-xl font-bold">{t("tourismTrip.passNotAvailable")}</h1>
        </div>
      </main>
    );
  }

  const payload = pass ? `trip:${pass.pass_token}` : null;

  return (
    <main className="surface-navy min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="shadow-luxe mx-auto max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground">
        <div className="surface-navy flex items-center gap-3 p-5">
          <Logo size={44} />
          <div>
            <p className="font-display font-semibold">Waleed &amp; Talaat</p>
            <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">
              {pass?.package_type === "friends"
                ? t("tourismTrip.passPackageFriends")
                : t("tourismTrip.passPackageStandard")}
            </p>
          </div>
          {pass && (
            <Badge className="btn-gold ms-auto">{formatTripDate(pass.trip_date, lang)}</Badge>
          )}
        </div>

        {pass && (
          <div className="p-6">
            <h1 className="text-xl font-bold">{pass.title}</h1>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {[...pass.passengers]
                .sort((a, b) => a.position - b.position)
                .map((p) => (
                  <li key={p.position}>
                    {p.position}. {p.full_name}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="flex justify-center border-y border-dashed border-border bg-secondary/60 p-6">
          <div
            className="flex size-[220px] items-center justify-center rounded-2xl p-4"
            style={{ backgroundColor: "#ffffff", colorScheme: "light" }}
          >
            {status === "loading" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <Loader2 className="size-8 animate-spin text-[#6b7280]" />
                <p className="px-4 text-xs font-medium text-[#1f2937]">{t("common.loading")}</p>
              </div>
            ) : status === "fetch_error" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <AlertCircle className="size-8 text-[#6b7280]" />
                <p className="px-4 text-xs font-medium text-[#1f2937]">{t("pass.qrLoadFailed")}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="btn-gold rounded-full px-4 py-1.5 text-xs"
                >
                  {t("pass.retry")}
                </button>
              </div>
            ) : payload ? (
              <QRCodeSVG
                value={payload}
                size={200}
                level="H"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
