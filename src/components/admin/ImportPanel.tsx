import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Upload, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { generateTempPassword, generateUsername } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { normalizeRouteName } from "@/lib/routeAliases";
import { normalizePhotoUrl } from "@/lib/driveImage";
import {
  mapSubscriptionChoice,
  subscriptionBadge,
  type PaymentStatus,
  type SubscriptionType,
} from "@/lib/subscription";

type ParsedRow = {
  full_name: string;
  phone: string;
  route: string;
  photo_url: string;
  pickup_stop: string;
  subscription_type: SubscriptionType;
  payment_status: PaymentStatus;
  trips_total: number;
  username: string;
  temp_password: string;
};

type ImportResult = {
  full_name: string;
  phone: string;
  username: string;
  email: string;
  temp_password: string;
  status: "created" | "failed";
  error?: string;
};

/** Normalizes a local Egyptian number like "01012345678" to "201012345678". */
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

function credentialsWhatsAppLink(r: ImportResult): string {
  const message =
    `Hi ${r.full_name}! Your Waleed & Talaat account is ready ✅\n` +
    `Login email: ${r.email}\n` +
    `Password: ${r.temp_password}\n\n` +
    `Sign in at ${window.location.origin}/auth`;
  return `https://wa.me/${toWhatsAppNumber(r.phone)}?text=${encodeURIComponent(message)}`;
}

/** Pulls a value out of a row by trying several possible header spellings, in order. */
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function rowsToParsed(data: Record<string, unknown>[]): ParsedRow[] {
  return data
    .filter((r) => pick(r, ["اسم الطالب", "Name", "Full Name"]))
    .map((r, i) => {
      const name = pick(r, ["اسم الطالب", "Name", "Full Name"]);
      const rawRoute = pick(r, ["الخط", "Route"]);
      const planRaw = pick(r, ["برجاء", "Subscription Type"]);
      const plan = mapSubscriptionChoice(planRaw);
      const explicitTrips = Number(pick(r, ["Initial Trips Count", "Trips"]) || 0) || 0;
      return {
        full_name: name,
        phone: pick(r, ["رقم الطالب", "WhatsApp Number", "Phone"]),
        route: normalizeRouteName(rawRoute),
        photo_url: normalizePhotoUrl(pick(r, ["4x6 صورة شخصية", "Photo URL", "photo_url"])),
        pickup_stop: pick(r, ["Pickup Stop"]),
        subscription_type: plan.subscription_type,
        payment_status: plan.payment_status,
        trips_total: explicitTrips || plan.trips_total || 0,
        username: generateUsername(name, i),
        temp_password: generateTempPassword(),
      };
    });
}

export function ImportPanel() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        toast.error("Could not read a sheet from this file.");
        return;
      }
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = rowsToParsed(data);
      if (parsed.length === 0) {
        toast.error(
          "No valid rows found. Expected columns: اسم الطالب, رقم الطالب, 4x6 صورة شخصية, الخط.",
        );
        return;
      }
      setRows(parsed);
      setResults([]);
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = rowsToParsed(res.data);
        if (parsed.length === 0) {
          toast.error(
            "No valid rows found. Expected columns: اسم الطالب, رقم الطالب, 4x6 صورة شخصية, الخط.",
          );
          return;
        }
        setRows(parsed);
        setResults([]);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const createAccounts = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("bulk-import-students", {
      body: { students: rows },
    });
    setBusy(false);
    if (error) {
      toast.error(
        await edgeFunctionErrorMessage(
          error,
          "Import failed. Is the bulk-import-students function deployed?",
        ),
      );
      return;
    }
    const created = (data?.results as ImportResult[]) ?? [];
    setResults(created);
    const failCount = created.filter((r) => r.status === "failed").length;
    toast.success(
      failCount === 0
        ? `${created.length} accounts created`
        : `${created.length - failCount} created, ${failCount} failed`,
    );
  };

  const downloadCredentials = () => {
    const csv = Papa.unparse(
      results.map((r) => ({
        Name: r.full_name,
        Phone: r.phone,
        Username: r.username,
        "Login Email": r.email,
        "Temporary Password": r.temp_password,
        Status: r.status,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "waleed-talaat-new-accounts.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">Bulk student import</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the roster sheet (.xlsx or .csv) with columns: <code dir="rtl">اسم الطالب</code>,{" "}
          <code dir="rtl">رقم الطالب</code>, <code dir="rtl">4x6 صورة شخصية</code>,{" "}
          <code dir="rtl">الخط</code>, and <code dir="rtl">برجاء</code> for the subscription plan
          (سداد كامل / قسط / عرض الدحيحة / 70 رحلة / اسبوعي). Payment amount, receipt and other
          columns are ignored automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Choose file
          </Button>
          {rows.length > 0 && (
            <Button className="btn-gold" disabled={busy} onClick={() => void createAccounts()}>
              <UserPlus className="size-4" /> Create {rows.length} account
              {rows.length === 1 ? "" : "s"}
            </Button>
          )}
          {results.length > 0 && (
            <Button variant="secondary" onClick={downloadCredentials}>
              <Download className="size-4" /> Download credentials sheet
            </Button>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="overflow-x-auto rounded-3xl border border-border bg-card p-6">
          <h3 className="mb-4 font-semibold">Preview — generated usernames &amp; temp passwords</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Temp password</TableHead>
                {results.length > 0 && <TableHead>Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const outcome = results.find((res) => res.username === r.username);
                return (
                  <TableRow key={r.username}>
                    <TableCell>
                      {r.photo_url ? (
                        <div className="size-8 overflow-hidden rounded-full">
                          <SmartAvatar
                            photoUrl={r.photo_url}
                            name={r.full_name}
                            className="size-full text-[10px]"
                          />
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.phone || "—"}</TableCell>
                    <TableCell>{r.route || "—"}</TableCell>
                    <TableCell>
                      {(() => {
                        const b = subscriptionBadge(r.subscription_type, r.payment_status);
                        return (
                          <span className="whitespace-nowrap">
                            {b.emoji} {b.label}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.username}</TableCell>
                    <TableCell className="font-mono text-xs">{r.temp_password}</TableCell>
                    {results.length > 0 && (
                      <TableCell>
                        {outcome?.status === "created" ? (
                          <a
                            href={credentialsWhatsAppLink({
                              full_name: r.full_name,
                              phone: r.phone,
                              username: r.username,
                              email: `${r.username}@wt-shuttle.app`,
                              temp_password: r.temp_password,
                              status: "created",
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-success underline underline-offset-2"
                          >
                            Send on WhatsApp
                          </a>
                        ) : outcome ? (
                          <span className="text-destructive">Failed</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
