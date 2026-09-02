import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Lock, MoonStar, Sun, Sunset, TicketCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useRoutes } from "@/hooks/useRoutes";
import { subscriptionBadge } from "@/lib/subscription";
import {
  EarlyReturnSector,
  SECTOR_LABELS,
  EARLY_RETURN_ROUTE_NAME,
  stopsForSector,
} from "@/lib/earlyReturnSectors";
import {
  MORNING_SLOTS,
  RETURN_SLOTS,
  morningWindow,
  optOutWindow,
  prettyDate,
  returnWindow,
} from "@/lib/schedule";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My bookings — Waleed & Talaat Shuttle" },
      {
        name: "description",
        content:
          "Reserve your morning departure and early return seat on the Alexandria to Alamein shuttle.",
      },
      { property: "og:title", content: "My bookings — Waleed & Talaat Shuttle" },
      { property: "og:description", content: "Reserve your daily shuttle seat." },
    ],
  }),
  component: Dashboard,
});

type Booking = {
  id: string;
  kind: string;
  slot: string;
  service_date: string;
  pickup_stop: string | null;
  route: string | null;
  sector: string | null;
};

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { stopsByRoute } = useRoutes();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [optedOut, setOptedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  const mw = useMemo(() => morningWindow(), []);
  const rw = useMemo(() => returnWindow(), []);
  const ow = useMemo(() => optOutWindow(), []);

  const [stop, setStop] = useState<string>("");
  const [morningSlot, setMorningSlot] = useState<string>(MORNING_SLOTS[0]);
  const [returnSlot, setReturnSlot] = useState<string>(RETURN_SLOTS[0]);
  const [returnSector, setReturnSector] = useState<EarlyReturnSector | "">("");
  const [returnStop, setReturnStop] = useState<string>("");
  const [fourPmStop, setFourPmStop] = useState<string>("");
  const stopsForMyRoute = profile?.route ? (stopsByRoute[profile.route] ?? []) : [];
  const isFourPmReturn = returnSlot === "04:00 PM";
  const RETURN_SLOT_CHOICES = [...RETURN_SLOTS, "04:00 PM"];

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile?.route) {
      const stops = stopsByRoute[profile.route] ?? [];
      setStop(
        profile.pickup_stop && stops.includes(profile.pickup_stop)
          ? profile.pickup_stop
          : (stops[0] ?? ""),
      );
      setFourPmStop(
        profile.pickup_stop && stops.includes(profile.pickup_stop)
          ? profile.pickup_stop
          : (stops[0] ?? ""),
      );
    }
  }, [profile, stopsByRoute]);

  const reload = async () => {
    if (!user) return;
    const [{ data: b }, { data: o }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id,kind,slot,service_date,pickup_stop,route,sector")
        .in("service_date", [mw.serviceDate, rw.serviceDate]),
      supabase.from("opt_outs").select("id").eq("service_date", ow.serviceDate),
    ]);
    setBookings((b as Booking[]) ?? []);
    setOptedOut((o ?? []).length > 0);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const morningBooking = bookings.find(
    (b) => b.kind === "morning" && b.service_date === mw.serviceDate,
  );
  const returnBooking = bookings.find(
    (b) => b.kind === "return" && b.service_date === rw.serviceDate,
  );

  const book = async (kind: "morning" | "return") => {
    if (!user) return;
    if (kind === "return") {
      if (isFourPmReturn && !fourPmStop) {
        toast.error("Choose a drop-off stop first.");
        return;
      }
      if (!isFourPmReturn && (!returnSector || !returnStop)) {
        toast.error("Choose a sector and drop-off stop first.");
        return;
      }
    }
    setBusy(true);
    const payload = {
      student_id: user.id,
      kind,
      slot: kind === "morning" ? morningSlot : returnSlot,
      service_date: kind === "morning" ? mw.serviceDate : rw.serviceDate,
      route:
        kind === "morning" || isFourPmReturn ? (profile?.route ?? null) : EARLY_RETURN_ROUTE_NAME,
      pickup_stop: kind === "morning" ? stop : isFourPmReturn ? fourPmStop : returnStop,
      sector: kind === "return" && !isFourPmReturn ? returnSector : null,
    };
    const { error } = await supabase
      .from("bookings")
      .upsert(payload, { onConflict: "student_id,service_date,kind" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "morning" ? "Morning seat reserved" : "Return seat reserved");
    void reload();
  };

  const cancel = async (id: string) => {
    await supabase.from("bookings").delete().eq("id", id);
    toast.success("Booking cancelled");
    void reload();
  };

  const toggleOptOut = async () => {
    if (!user) return;
    setBusy(true);
    if (optedOut) {
      await supabase.from("opt_outs").delete().eq("service_date", ow.serviceDate);
    } else {
      await supabase.from("opt_outs").insert({ student_id: user.id, service_date: ow.serviceDate });
    }
    setBusy(false);
    void reload();
  };

  if (loading || !profile) {
    return <main className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <ProfileAvatar />
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Welcome back</p>
          <h1 className="text-2xl font-bold">{profile.full_name || "Student"}</h1>
          <p className="mt-1 text-sm opacity-80">
            {profile.route ?? "No route set"} · {profile.pickup_stop ?? "No stop set"}
          </p>
          <Badge
            className={`mt-2 ${subscriptionBadge(profile.subscription_type, profile.payment_status).className}`}
          >
            {subscriptionBadge(profile.subscription_type, profile.payment_status).emoji}{" "}
            {subscriptionBadge(profile.subscription_type, profile.payment_status).label}
          </Badge>
        </div>
        <div className="border-gilded ms-auto rounded-2xl px-5 py-3 text-center">
          <p className="text-xs opacity-70 uppercase">
            {profile.subscription_type === "70_trips" ? "Trips remaining" : "Subscription"}
          </p>
          <p className="text-gilded text-xl font-bold">
            {profile.subscription_type === "70_trips"
              ? `${profile.trips_remaining}/${profile.trips_total}`
              : "Full term"}
          </p>
          {profile.subscription_type === "70_trips" && (
            <Link
              to="/trips"
              className="mt-1 block text-[11px] underline underline-offset-2 opacity-80"
            >
              View scan history
            </Link>
          )}
        </div>
        <Link to="/pass">
          <Button className="btn-gold">
            <TicketCheck className="size-4" /> Boarding pass
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Panel
          icon={Sun}
          title="Morning departure"
          subtitle={`For ${prettyDate(mw.serviceDate)}`}
          window={mw.label}
          open={mw.open}
        >
          {morningBooking ? (
            <Confirmed
              text={`${morningBooking.slot} · ${morningBooking.pickup_stop ?? ""}`}
              onCancel={mw.open ? () => void cancel(morningBooking.id) : undefined}
            />
          ) : mw.open ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2">
                <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                  Your route
                </p>
                <p className="text-sm font-semibold">
                  {profile.route ?? "No route assigned — contact admin"}
                </p>
              </div>
              <SelectField
                label="Departure stop"
                value={stop}
                options={stopsForMyRoute}
                onChange={setStop}
              />
              <SlotPicker
                options={[...MORNING_SLOTS]}
                value={morningSlot}
                onChange={setMorningSlot}
              />
              <Button
                className="btn-gold w-full"
                disabled={busy || !profile.route}
                onClick={() => void book("morning")}
              >
                Reserve morning seat
              </Button>
            </div>
          ) : (
            <Closed text="Morning booking opens at 12:00 PM and closes at 7:00 PM." />
          )}
        </Panel>

        <Panel
          icon={Sunset}
          title="Early return"
          subtitle={`For ${prettyDate(rw.serviceDate)}`}
          window={rw.label}
          open={rw.open}
        >
          {returnBooking ? (
            <Confirmed
              text={`${returnBooking.slot} · ${returnBooking.sector ? SECTOR_LABELS[returnBooking.sector as EarlyReturnSector] + " · " : ""}${returnBooking.pickup_stop ?? ""}`}
              onCancel={rw.open ? () => void cancel(returnBooking.id) : undefined}
            />
          ) : rw.open ? (
            <div className="space-y-4">
              <SlotPicker
                options={RETURN_SLOT_CHOICES}
                value={returnSlot}
                onChange={setReturnSlot}
              />

              {isFourPmReturn ? (
                <>
                  <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2">
                    <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
                      Your route
                    </p>
                    <p className="text-sm font-semibold">
                      {profile.route ?? "No route assigned — contact admin"}
                    </p>
                  </div>
                  <SelectField
                    label="Drop-off stop"
                    value={fourPmStop}
                    options={stopsForMyRoute}
                    onChange={setFourPmStop}
                  />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Sector (relative to Sidi Gaber)</Label>
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
                    <SelectField
                      label="Drop-off stop"
                      value={returnStop}
                      options={stopsForSector(returnSector)}
                      onChange={setReturnStop}
                    />
                  )}
                </>
              )}

              <Button
                className="btn-gold w-full"
                disabled={
                  busy ||
                  (isFourPmReturn ? !fourPmStop || !profile.route : !returnSector || !returnStop)
                }
                onClick={() => void book("return")}
              >
                Reserve return seat
              </Button>
            </div>
          ) : (
            <Closed text="Early return booking opens at 6:30 AM and closes at 10:30 AM." />
          )}
        </Panel>
      </div>

      <div className="mt-5 rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <MoonStar className="text-accent mt-1 size-5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">The 4:00 PM bus needs no booking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every subscribed student has a guaranteed seat on the 4:00 PM return by default — no
              action needed. If you'd like to pin down your exact drop-off stop, you can also book
              4:00 PM above like any other return slot. Only tell us if you are <em>not</em> coming,
              so we can right-size the fleet.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant={optedOut ? "secondary" : "outline"}
                disabled={busy || !ow.open}
                onClick={() => void toggleOptOut()}
              >
                {optedOut
                  ? "Undo — I will use the 4:00 PM bus"
                  : "I won't use the 4:00 PM bus today"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {ow.open ? "Available until 3:30 PM" : "Closed for today (after 3:30 PM)"}
              </span>
              {optedOut && <Badge className="bg-warning text-warning-foreground">Opted out</Badge>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  window: win,
  open,
  children,
}: {
  icon: typeof Sun;
  title: string;
  subtitle: string;
  window: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <Icon className="text-accent size-5" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge
          className={`ms-auto ${open ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}
        >
          <Clock className="me-1 size-3" /> {win}
        </Badge>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SlotPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Time slot</Label>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
              value === o
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border hover:bg-secondary"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Confirmed({ text, onCancel }: { text: string; onCancel?: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary p-5">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">Confirmed</p>
      <p className="mt-1 text-xl font-bold">{text}</p>
      {onCancel && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Cancel booking
        </Button>
      )}
    </div>
  );
}

function Closed({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
