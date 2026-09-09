import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { subscriptionBadge } from "@/lib/subscription";
import { morningWindow } from "@/lib/schedule";

export const Route = createFileRoute("/route-dashboard")({
  head: () => ({ meta: [{ title: "Route Dashboard — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <RouteDashboardPage />
    </AdminGuard>
  ),
});

type PassengerRow = {
  route: string | null;
  pickup_stop: string | null;
  student_id: string | null;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  subscription_type: string;
  payment_status: string;
  source: string;
};

function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function RouteDashboardPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes } = useRoutes();
  const mw = useMemo(() => morningWindow(), []);

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [rows, setRows] = useState<PassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_route_stop_breakdown", {
        p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
        p_service_date: mw.serviceDate,
      });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setRows((data as PassengerRow[]) ?? []);
    })();
  }, [effectiveRoute, mw.serviceDate]);

  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.full_name.toLowerCase().includes(q) || (r.phone ?? "").includes(q);
  });

  // Group by route, then by stop, preserving the order the RPC already sorted them in.
  const grouped = useMemo(() => {
    const byRoute = new Map<string, Map<string, PassengerRow[]>>();
    for (const r of filteredRows) {
      const routeKey = r.route ?? "—";
      const stopKey = r.pickup_stop ?? "—";
      if (!byRoute.has(routeKey)) byRoute.set(routeKey, new Map());
      const stops = byRoute.get(routeKey)!;
      if (!stops.has(stopKey)) stops.set(stopKey, []);
      stops.get(stopKey)!.push(r);
    }
    return byRoute;
  }, [filteredRows]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {t("routeDash.upcomingTrip")} · {mw.serviceDate}
          </p>
          <h1 className="text-2xl font-bold">{t("routeDash.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
            >
              <option value="all">{t("students.allRoutes")}</option>
              {routes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <Badge className="btn-gold">{profile?.assigned_route ?? "—"}</Badge>
          )}
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Badge className="ms-auto bg-muted text-muted-foreground">
            <Users className="me-1 size-3.5" /> {filteredRows.length}
          </Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filteredRows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("routeDash.noStops")}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {[...grouped.entries()].map(([routeName, stops]) => (
              <div key={routeName}>
                {routeFilter === "all" && isAdmin && (
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">{routeName}</p>
                )}
                <Accordion type="multiple" className="rounded-xl border border-border">
                  {[...stops.entries()].map(([stopName, passengers]) => (
                    <AccordionItem key={stopName} value={stopName} className="px-4">
                      <AccordionTrigger>
                        <span className="flex items-center gap-3">
                          <span className="font-medium">{stopName}</span>
                          <Badge className="btn-gold">
                            {passengers.length} {t("routeDash.passengers")}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="divide-y divide-border">
                          {passengers.map((p, i) => {
                            const badge =
                              p.source === "daily_pass"
                                ? null
                                : subscriptionBadge(p.subscription_type, p.payment_status);
                            return (
                              <li
                                key={p.student_id ?? `${stopName}-${i}`}
                                className="flex items-center gap-3 py-3"
                              >
                                <div className="size-9 shrink-0 overflow-hidden rounded-full">
                                  <SmartAvatar
                                    photoUrl={p.photo_url}
                                    name={p.full_name}
                                    className="size-full text-xs"
                                  />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{p.full_name}</p>
                                  <p className="text-xs text-muted-foreground">{p.phone ?? "—"}</p>
                                </div>
                                {badge ? (
                                  <Badge className={badge.className}>
                                    {badge.emoji} {badge.label}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-orange-500 text-white">
                                    {t("routeDash.dailyPass")}
                                  </Badge>
                                )}
                                {p.phone && (
                                  <a
                                    href={`https://wa.me/${toWhatsAppNumber(p.phone)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent"
                                    title={t("routeDash.callWhatsapp")}
                                  >
                                    <MessageCircle className="size-4" />
                                  </a>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
