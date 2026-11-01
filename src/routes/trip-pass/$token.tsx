import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Hourglass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Brand";
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

// QR center emblem: the project crest at ~20% of the 220px QR, well
// within level-H's error-correction budget. Verified with a jsqr
// decode test (render -> excavate -> overlay -> decode) before
// landing this — square modules only, no custom dot shapes, so
// html5-qrcode (the scanner's decoder) keeps reading it reliably.
const QR_SIZE = 220;
const QR_LOGO_SIZE = Math.round(QR_SIZE * 0.2);

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
        <div className="border-gilded shadow-luxe w-full max-w-sm rounded-2xl bg-black/20 p-8 text-center text-white">
          <Hourglass className="mx-auto size-10 text-amber-300" />
          <h1 className="mt-4 text-xl font-bold">{t("tourismTrip.passNotAvailable")}</h1>
        </div>
      </main>
    );
  }

  const payload = pass ? `trip:${pass.pass_token}` : null;
  const sortedPassengers = pass ? [...pass.passengers].sort((a, b) => a.position - b.position) : [];

  return (
    <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="shadow-luxe relative overflow-hidden rounded-2xl border border-amber-400/30 shadow-[0_0_40px_-10px_rgba(212,175,55,0.35)]">
          {/* Faint oversized watermark behind everything */}
          <img
            src="/logo.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 m-auto size-[340px] opacity-[0.04]"
          />

          <div className="surface-navy relative z-10">
            {/* Header badge */}
            <div className="flex items-center gap-3 p-5 pb-4">
              <Logo size={40} />
              <div>
                <p className="text-sm font-semibold tracking-wide text-amber-300">
                  Waleed &amp; Talaat
                </p>
                <p className="text-[10px] tracking-[0.25em] text-amber-200/70 uppercase">
                  Executive Tour Pass
                </p>
              </div>
            </div>

            {/* QR */}
            <div className="flex justify-center px-5 pb-5">
              <div
                className="rounded-2xl p-4 shadow-[0_0_30px_-6px_rgba(212,175,55,0.5)] ring-2 ring-amber-400/60"
                style={{ backgroundColor: "#ffffff", colorScheme: "light" }}
              >
                {status === "loading" ? (
                  <div className="flex size-[220px] flex-col items-center justify-center gap-2 text-center">
                    <Loader2 className="size-8 animate-spin text-[#6b7280]" />
                    <p className="px-4 text-xs font-medium text-[#1f2937]">{t("common.loading")}</p>
                  </div>
                ) : status === "fetch_error" ? (
                  <div className="flex size-[220px] flex-col items-center justify-center gap-2 text-center">
                    <AlertCircle className="size-8 text-[#6b7280]" />
                    <p className="px-4 text-xs font-medium text-[#1f2937]">
                      {t("pass.qrLoadFailed")}
                    </p>
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
                    size={QR_SIZE}
                    level="H"
                    marginSize={4}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    imageSettings={{
                      src: "/logo.jpg",
                      width: QR_LOGO_SIZE,
                      height: QR_LOGO_SIZE,
                      excavate: true,
                    }}
                  />
                ) : null}
              </div>
            </div>

            {pass && (
              <>
                {/* Perforated ticket divider */}
                <div className="relative">
                  <span
                    className="absolute -start-2 top-1/2 size-4 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: "var(--navy-deep)" }}
                  />
                  <span
                    className="absolute -end-2 top-1/2 size-4 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: "var(--navy-deep)" }}
                  />
                  <div className="mx-6 border-t border-dashed border-white/25" />
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2.5 p-5">
                  <div className="col-span-2 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-emerald-300">
                    <span className="relative flex size-2.5">
                      <span className="motion-reduce:animate-none absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="text-sm font-semibold">{t("tourismTrip.passValidBadge")}</span>
                  </div>

                  <Chip full label={t("tourismTrip.passengerNameLabel")}>
                    {pass.package_type === "friends" ? (
                      <ul className="space-y-1">
                        {sortedPassengers.map((p) => (
                          <li key={p.position} className="flex items-center gap-2 text-sm">
                            <span className="text-white/40">{p.position}.</span>
                            <span className="font-semibold">{p.full_name}</span>
                            {p.position === 1 && (
                              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                {t("tourismTrip.leadPersonLabel")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      sortedPassengers[0]?.full_name
                    )}
                  </Chip>

                  <Chip label={t("tourismTrip.tripDateLabel")}>
                    {formatTripDate(pass.trip_date, lang)}
                  </Chip>
                  <Chip label={t("tourismTrip.destinationLabel")}>{pass.title}</Chip>
                  <Chip label={t("tourismTrip.packageChipLabel")}>
                    {pass.package_type === "friends"
                      ? t("tourismTrip.passPackageFriends")
                      : t("tourismTrip.passPackageStandard")}
                  </Chip>
                </div>

                <p className="px-5 pb-5 text-center text-[11px] text-white/50">
                  {t("tourismTrip.passFooterNote")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Chip({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 p-3 text-white ${full ? "col-span-2" : ""}`}
    >
      <p className="text-[10px] font-medium tracking-wider text-white/50 uppercase">{label}</p>
      <div className="mt-1 text-sm font-bold">{children}</div>
    </div>
  );
}
