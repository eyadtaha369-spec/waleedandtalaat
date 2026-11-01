import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesQuery } from "@/lib/searchNormalize";
import {
  PAYMENT_METHOD_LABELS,
  formatTripDate,
  toWhatsAppNumber,
  type TripBookingStatus,
  type TripPackageType,
  type TripPaymentMethod,
} from "@/lib/tourismTrips";

type TripRow = {
  id: string;
  title: string;
  trip_date: string;
  payment_instructions: string | null;
  terms: string[];
  is_active: boolean;
};

type TripPassengerRow = {
  id: string;
  booking_id: string;
  position: number;
  full_name: string;
  phone: string;
};

type TripBookingRow = {
  id: string;
  trip_id: string;
  package_type: TripPackageType;
  status: TripBookingStatus;
  amount: number;
  sender_phone: string;
  payment_method: TripPaymentMethod;
  receipt_path: string;
  pass_token: string;
  created_at: string;
  trip_booking_passengers: TripPassengerRow[];
};

type PackageFilter = "all" | TripPackageType;
type StatusFilter = "all" | TripBookingStatus;

function leadOf(b: TripBookingRow): TripPassengerRow | undefined {
  return [...b.trip_booking_passengers].sort((a, c) => a.position - c.position)[0];
}

export function TripsAdminPanel() {
  const { t, lang } = useLanguage();
  const [trip, setTrip] = useState<TripRow | null | undefined>(undefined);
  const [bookings, setBookings] = useState<TripBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [packageFilter, setPackageFilter] = useState<PackageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupLink, setGroupLink] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [termsText, setTermsText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);

  const loadTrip = async () => {
    const { data } = await supabase
      .from("tourism_trips")
      .select("id,title,trip_date,payment_instructions,terms,is_active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTrip((data as TripRow | null) ?? null);
  };

  const loadBookings = async (tripId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trip_bookings")
      .select("*, trip_booking_passengers(*)")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBookings((data as unknown as TripBookingRow[]) ?? []);
  };

  useEffect(() => {
    void loadTrip();
  }, []);

  useEffect(() => {
    if (!trip) return;
    void loadBookings(trip.id);
    setPaymentInstructions(trip.payment_instructions ?? "");
    setTermsText(trip.terms.join("\n"));
    setIsActive(trip.is_active);
    void supabase
      .from("tourism_trip_secrets")
      .select("whatsapp_group_link")
      .eq("trip_id", trip.id)
      .maybeSingle()
      .then(({ data }) => setGroupLink(data?.whatsapp_group_link ?? ""));
  }, [trip]);

  const saveSettings = async () => {
    if (!trip) return;
    setSettingsBusy(true);
    const terms = termsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const [{ error: tripError }, { error: secretError }] = await Promise.all([
      supabase
        .from("tourism_trips")
        .update({
          payment_instructions: paymentInstructions.trim() || null,
          terms,
          is_active: isActive,
        })
        .eq("id", trip.id),
      supabase
        .from("tourism_trip_secrets")
        .upsert(
          { trip_id: trip.id, whatsapp_group_link: groupLink.trim() || null },
          { onConflict: "trip_id" },
        ),
    ]);
    setSettingsBusy(false);
    if (tripError || secretError) {
      toast.error(t("tourismAdmin.settingsSaveFailed"));
      return;
    }
    toast.success(t("tourismAdmin.settingsSaved"));
    await loadTrip();
  };

  const viewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("trip-receipts")
      .createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const buildWhatsAppMessage = (booking: TripBookingRow): string => {
    if (!trip) return "";
    const dateLabel = formatTripDate(trip.trip_date, lang);
    const passLink = `${window.location.origin}/trip-pass/${booking.pass_token}`;
    const lines = [
      `${t("tourismAdmin.waConfirmedPrefix")} ${trip.title} ${t("tourismAdmin.waDateLabel")} ${dateLabel}.`,
      `${t("tourismAdmin.waGroupLinkLabel")} ${groupLink || t("tourismAdmin.waGroupLinkMissing")}`,
      `${t("tourismAdmin.waPassLinkLabel")} ${passLink}`,
    ];
    if (booking.package_type === "friends") {
      const names = [...booking.trip_booking_passengers]
        .sort((a, b) => a.position - b.position)
        .map((p) => p.full_name);
      lines.push(`${t("tourismAdmin.waFriendsNote")} ${names.join("، ")}`);
    }
    lines.push(t("tourismAdmin.waClosing"));
    return lines.join("\n");
  };

  const sendWhatsApp = (booking: TripBookingRow) => {
    const lead = leadOf(booking);
    if (!lead) return;
    if (!groupLink) toast.error(t("tourismAdmin.groupLinkMissingWarning"));
    const message = buildWhatsAppMessage(booking);
    const url = `https://wa.me/${toWhatsAppNumber(lead.phone)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const review = async (booking: TripBookingRow, status: "approved" | "rejected") => {
    if (status === "rejected" && !window.confirm(t("tourismAdmin.confirmReject"))) return;
    setBusyId(booking.id);
    const { data, error } = await supabase.rpc("review_trip_booking", {
      p_booking_id: booking.id,
      p_status: status,
    });
    setBusyId(null);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(
        (data as { error?: string } | null)?.error ??
          error?.message ??
          t("tourismAdmin.actionFailed"),
      );
      return;
    }
    if (trip) await loadBookings(trip.id);
    if (status === "approved") sendWhatsApp(booking);
  };

  const counts = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "pending").length;
    const approved = bookings.filter((b) => b.status === "approved");
    const rejected = bookings.filter((b) => b.status === "rejected").length;
    const approvedSeats = approved.reduce((sum, b) => sum + b.trip_booking_passengers.length, 0);
    const approvedRevenue = approved.reduce((sum, b) => sum + Number(b.amount), 0);
    return {
      total: bookings.length,
      pending,
      approvedCount: approved.length,
      rejected,
      approvedSeats,
      approvedRevenue,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => packageFilter === "all" || b.package_type === packageFilter)
      .filter((b) => statusFilter === "all" || b.status === statusFilter)
      .filter((b) => {
        const haystack = [
          ...b.trip_booking_passengers.map((p) => p.full_name),
          ...b.trip_booking_passengers.map((p) => p.phone),
          b.sender_phone,
        ];
        return matchesQuery(haystack, search);
      });
  }, [bookings, packageFilter, statusFilter, search]);

  if (trip === undefined || loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (trip === null) {
    return <p className="text-sm text-muted-foreground">{t("tourismTrip.notFound")}</p>;
  }

  const friendsBookings = filteredBookings.filter((b) => b.package_type === "friends");
  const standardBookings = filteredBookings.filter((b) => b.package_type === "standard");

  return (
    <div className="space-y-6">
      <Collapsible
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        className="rounded-3xl border border-border bg-card p-6"
      >
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full cursor-pointer items-center justify-between">
            <h2 className="font-semibold">{t("tourismAdmin.settingsTitle")}</h2>
            {settingsOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>{t("tourismAdmin.whatsappGroupLink")}</Label>
            <Input value={groupLink} onChange={(e) => setGroupLink(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>{t("tourismAdmin.paymentInstructions")}</Label>
            <Textarea
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tourismAdmin.termsLabel")}</Label>
            <Textarea value={termsText} onChange={(e) => setTermsText(e.target.value)} rows={6} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>{t("tourismAdmin.isActiveLabel")}</Label>
          </div>
          <Button className="btn-gold" disabled={settingsBusy} onClick={() => void saveSettings()}>
            {t("tourismAdmin.saveSettings")}
          </Button>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label={t("tourismAdmin.totalBookings")} value={counts.total} />
        <StatTile label={t("tourismAdmin.pendingCount")} value={counts.pending} />
        <StatTile label={t("tourismAdmin.approvedCount")} value={counts.approvedCount} />
        <StatTile label={t("tourismAdmin.rejectedCount")} value={counts.rejected} />
        <StatTile label={t("tourismAdmin.approvedSeats")} value={counts.approvedSeats} />
        <StatTile
          label={t("tourismAdmin.approvedRevenue")}
          value={`${counts.approvedRevenue} ${t("common.egp")}`}
          accent
        />
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value as PackageFilter)}
          >
            <option value="all">{t("tourismAdmin.filterPackageAll")}</option>
            <option value="standard">{t("tourismAdmin.filterPackageStandard")}</option>
            <option value="friends">{t("tourismAdmin.filterPackageFriends")}</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">{t("tourismAdmin.filterStatusAll")}</option>
            <option value="pending">{t("tourismAdmin.filterStatusPending")}</option>
            <option value="approved">{t("tourismAdmin.filterStatusApproved")}</option>
            <option value="rejected">{t("tourismAdmin.filterStatusRejected")}</option>
          </select>
          <Input
            placeholder={t("tourismAdmin.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant={grouped ? "default" : "outline"}
            className={grouped ? "btn-gold" : ""}
            onClick={() => setGrouped((g) => !g)}
          >
            {grouped ? t("tourismAdmin.flatViewToggle") : t("tourismAdmin.groupedViewToggle")}
          </Button>
        </div>

        {filteredBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tourismAdmin.noBookings")}</p>
        ) : grouped ? (
          <div className="space-y-6">
            {friendsBookings.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold">{t("tourismAdmin.friendsCardsTitle")}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {friendsBookings.map((b) => (
                    <FriendsCard
                      key={b.id}
                      booking={b}
                      t={t}
                      busy={busyId === b.id}
                      onApprove={() => void review(b, "approved")}
                      onReject={() => void review(b, "rejected")}
                      onViewReceipt={() => void viewReceipt(b.receipt_path)}
                      onSendWhatsApp={() => sendWhatsApp(b)}
                    />
                  ))}
                </div>
              </div>
            )}
            {standardBookings.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold">{t("tourismAdmin.standardListTitle")}</h3>
                <div className="space-y-2">
                  {standardBookings.map((b) => (
                    <StandardRow
                      key={b.id}
                      booking={b}
                      t={t}
                      busy={busyId === b.id}
                      onApprove={() => void review(b, "approved")}
                      onReject={() => void review(b, "rejected")}
                      onViewReceipt={() => void viewReceipt(b.receipt_path)}
                      onSendWhatsApp={() => sendWhatsApp(b)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tourismAdmin.columnDate")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnPackage")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnLead")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnSenderPhone")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnMethod")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnAmount")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnStatus")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnReceipt")}</TableHead>
                  <TableHead>{t("tourismAdmin.columnActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((b) => {
                  const lead = leadOf(b);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(b.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            b.package_type === "friends"
                              ? "bg-accent text-accent-foreground"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {b.package_type === "friends"
                            ? t("tourismAdmin.packageFriendsBadge")
                            : t("tourismAdmin.packageStandardBadge")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{lead?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{lead?.phone ?? "—"}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{b.sender_phone}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[b.payment_method]}</TableCell>
                      <TableCell>
                        {b.amount} {t("common.egp")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} t={t} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void viewReceipt(b.receipt_path)}
                        >
                          {t("tourismAdmin.viewReceipt")}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {b.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                className="btn-gold"
                                disabled={busyId === b.id}
                                onClick={() => void review(b, "approved")}
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === b.id}
                                onClick={() => void review(b, "rejected")}
                              >
                                <X className="size-4" />
                              </Button>
                            </>
                          )}
                          {b.status === "approved" && (
                            <Button size="sm" variant="outline" onClick={() => sendWhatsApp(b)}>
                              {t("tourismAdmin.sendWhatsapp")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-gilded" : "border-border bg-card"}`}>
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-gilded" : ""}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status, t }: { status: TripBookingStatus; t: (key: string) => string }) {
  const config: Record<TripBookingStatus, { label: string; className: string }> = {
    pending: {
      label: t("tourismAdmin.filterStatusPending"),
      className: "bg-warning text-warning-foreground",
    },
    approved: {
      label: t("tourismAdmin.filterStatusApproved"),
      className: "bg-success text-success-foreground",
    },
    rejected: {
      label: t("tourismAdmin.filterStatusRejected"),
      className: "bg-destructive text-destructive-foreground",
    },
  };
  const c = config[status];
  return <Badge className={c.className}>{c.label}</Badge>;
}

function FriendsCard({
  booking,
  t,
  busy,
  onApprove,
  onReject,
  onViewReceipt,
  onSendWhatsApp,
}: {
  booking: TripBookingRow;
  t: (key: string) => string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewReceipt: () => void;
  onSendWhatsApp: () => void;
}) {
  const passengers = [...booking.trip_booking_passengers].sort((a, b) => a.position - b.position);
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <Badge className="bg-accent text-accent-foreground">
          {t("tourismAdmin.packageFriendsBadge")}
        </Badge>
        <StatusBadge status={booking.status} t={t} />
      </div>
      <ul className="space-y-1">
        {passengers.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {p.position}. {p.full_name}
              {p.position === 1 && (
                <Badge className="btn-gold ms-2 align-middle">{t("tourismAdmin.lead")}</Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{p.phone}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("tourismAdmin.senderPhoneShort")}: {booking.sender_phone} ·{" "}
        {PAYMENT_METHOD_LABELS[booking.payment_method]} · {booking.amount} {t("common.egp")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onViewReceipt}>
          {t("tourismAdmin.viewReceipt")}
        </Button>
        {booking.status === "pending" && (
          <>
            <Button size="sm" className="btn-gold" disabled={busy} onClick={onApprove}>
              <Check className="size-4" /> {t("common.accept")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
              <X className="size-4" /> {t("common.reject")}
            </Button>
          </>
        )}
        {booking.status === "approved" && (
          <Button size="sm" variant="outline" onClick={onSendWhatsApp}>
            {t("tourismAdmin.sendWhatsapp")}
          </Button>
        )}
      </div>
    </div>
  );
}

function StandardRow({
  booking,
  t,
  busy,
  onApprove,
  onReject,
  onViewReceipt,
  onSendWhatsApp,
}: {
  booking: TripBookingRow;
  t: (key: string) => string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewReceipt: () => void;
  onSendWhatsApp: () => void;
}) {
  const lead = leadOf(booking);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4">
      <div className="flex-1">
        <p className="font-medium">{lead?.full_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {lead?.phone ?? "—"} · {t("tourismAdmin.senderPhoneShort")}: {booking.sender_phone} ·{" "}
          {PAYMENT_METHOD_LABELS[booking.payment_method]} · {booking.amount} {t("common.egp")}
        </p>
      </div>
      <StatusBadge status={booking.status} t={t} />
      <Button size="sm" variant="outline" onClick={onViewReceipt}>
        {t("tourismAdmin.viewReceipt")}
      </Button>
      {booking.status === "pending" && (
        <>
          <Button size="sm" className="btn-gold" disabled={busy} onClick={onApprove}>
            <Check className="size-4" /> {t("common.accept")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
            <X className="size-4" /> {t("common.reject")}
          </Button>
        </>
      )}
      {booking.status === "approved" && (
        <Button size="sm" variant="outline" onClick={onSendWhatsApp}>
          {t("tourismAdmin.sendWhatsapp")}
        </Button>
      )}
    </div>
  );
}
