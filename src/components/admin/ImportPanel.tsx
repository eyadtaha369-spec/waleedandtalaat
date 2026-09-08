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
import { generateTempPassword, generateUsername, credentialsWhatsAppLink } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { RecoverCredentialsPanel } from "@/components/admin/RecoverCredentialsPanel";
import { useLanguage } from "@/hooks/useLanguage";
import { withUtf8Bom, excelTextCell } from "@/lib/csvExport";
import { normalizeRouteName, stopColumnHeaderForRoute } from "@/lib/routeAliases";
import { normalizePhotoUrl } from "@/lib/driveImage";
import {
  mapSubscriptionChoice,
  subscriptionBadge,
  type InstallmentStatus,
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
  installment_status: InstallmentStatus;
  initial_amount_paid: number;
  payment_method: string;
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
  status: "created" | "updated" | "failed";
  error?: string;
};

/**
 * Pulls a value out of a row by trying several possible header
 * spellings, in order — exact key match first, then falling back to
 * any column whose actual header CONTAINS one of the given terms.
 * The fallback matters: a real sheet's header is often longer/more
 * specific than the short term we search for (e.g. the actual column
 * is "برجاء الاختيار من الآتي", not just "برجاء") — an exact-only
 * match would silently find nothing and this column would always
 * read as empty.
 */
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  for (const k of keys) {
    const matchKey = Object.keys(row).find((rk) => rk.includes(k));
    if (matchKey) {
      const v = row[matchKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

// Keywords anywhere in a row's cell values mean "don't import this
// student" — works for CSV and Excel alike, since it only looks at
// values, never styling.
const REFUND_KEYWORDS = [
  "مسترد",
  "استرداد",
  "ملغي",
  "ملغى",
  "مسترد فلوسه",
  "refunded",
  "cancelled",
  "canceled",
];

function rowMatchesRefundKeyword(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) => {
    const s = String(v ?? "").toLowerCase();
    return REFUND_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
  });
}

// Direct cell fill colors only — this can NOT see colors applied via
// Excel's Conditional Formatting rules, which live in a completely
// separate part of the file that a static read never touches. Only
// rows colored by manually setting a cell's fill (Format Cells) are
// caught here.
const RED_FILL_HEXES = new Set(["FF0000", "FFC7CE", "EFE4E1"]);

function isReddishHex(hex: string): boolean {
  const clean = hex.toUpperCase().replace(/^0+(?=[0-9A-F]{6}$)/, "");
  if (RED_FILL_HEXES.has(clean)) return true;
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return r > 180 && g < 160 && b < 160;
}

function sheetRowHasRedFill(sheet: XLSX.WorkSheet, rowIndex: number, colCount: number): boolean {
  // Real rosters have incidental colored cells (a flagged receipt
  // link, a stray empty cell with leftover formatting) that don't
  // mean "this student is cancelled" — only treat the row as
  // genuinely marked when most of its actual data is red, not just
  // one or two cells.
  let redCount = 0;
  let populatedCount = 0;
  for (let c = 0; c < colCount; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c })];
    if (cell?.v === undefined || cell.v === null || cell.v === "") continue;
    populatedCount++;
    const style = cell?.s as { fgColor?: { rgb?: string }; bgColor?: { rgb?: string } } | undefined;
    const rgb = style?.fgColor?.rgb ?? style?.bgColor?.rgb;
    if (rgb && isReddishHex(rgb)) redCount++;
  }
  if (populatedCount === 0) return false;
  return redCount >= 4 && redCount / populatedCount >= 0.5;
}

function rowsToParsed(
  data: Record<string, unknown>[],
  isRowSkipped?: (originalIndex: number) => boolean,
): { parsed: ParsedRow[]; skippedCount: number } {
  let skippedCount = 0;
  const parsed: ParsedRow[] = [];

  data.forEach((r, originalIndex) => {
    if (!pick(r, ["اسم الطالب", "Name", "Full Name"])) return;
    if (rowMatchesRefundKeyword(r) || (isRowSkipped?.(originalIndex) ?? false)) {
      skippedCount++;
      return;
    }

    const name = pick(r, ["اسم الطالب", "Name", "Full Name"]);
    const phone = pick(r, ["رقم الطالب", "WhatsApp Number", "Phone"]);
    const rawRoute = pick(r, ["الخط", "Route"]);
    const planRaw = pick(r, ["برجاء الاختيار من الآتي", "برجاء", "Subscription Type"]);
    const plan = mapSubscriptionChoice(planRaw);
    const explicitTrips = Number(pick(r, ["Initial Trips Count", "Trips"]) || 0) || 0;
    const canonicalRoute = normalizeRouteName(rawRoute);
    // The sheet has one column per route, headed with that route's own
    // name — but only the column matching THIS student's own route
    // actually holds their real stop; every other route's column for
    // this row holds a meaningless leftover number. A purely numeric
    // value means nothing was really filled in for that column.
    const routeStopHeader = stopColumnHeaderForRoute(canonicalRoute);
    const routeStopRaw = routeStopHeader ? pick(r, [routeStopHeader]) : "";
    const routeStop = /^\d+(\.\d+)?$/.test(routeStopRaw) ? "" : routeStopRaw;
    parsed.push({
      full_name: name,
      phone,
      route: canonicalRoute,
      photo_url: normalizePhotoUrl(pick(r, ["4x6 صورة شخصية", "Photo URL", "photo_url"])),
      pickup_stop: routeStop || pick(r, ["برجاء كتابة نقطة الركوب", "Pickup Stop"]),
      subscription_type: plan.subscription_type,
      payment_status: plan.payment_status,
      installment_status: plan.installment_status,
      initial_amount_paid: Number(pick(r, ["المبلغ المدفوع", "Initial Amount Paid"]) || 0) || 0,
      payment_method: pick(r, [
        "برجاء اختيار طريقة التسديد التي سددت بها ",
        "برجاء اختيار طريقة التسديد التي سددت بها",
        "Payment Method",
      ]),
      trips_total: explicitTrips || plan.trips_total || 0,
      username: generateUsername(name, parsed.length, phone),
      temp_password: generateTempPassword(),
    });
  });

  return { parsed, skippedCount };
}

export function ImportPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [skippedOnLoad, setSkippedOnLoad] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array", cellStyles: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        toast.error("Could not read a sheet from this file.");
        return;
      }
      // blankrows:true keeps data[i] aligned 1:1 with the sheet's
      // actual (i+1)-th data row (row 0 is the header) — needed so
      // the red-fill lookup below checks the right row.
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        blankrows: true,
      });
      const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
      const colCount = range ? range.e.c + 1 : 0;
      const { parsed, skippedCount } = rowsToParsed(data, (i) =>
        sheetRowHasRedFill(sheet, i + 1, colCount),
      );
      if (parsed.length === 0) {
        toast.error(
          "No valid rows found. Expected columns: اسم الطالب, رقم الطالب, 4x6 صورة شخصية, الخط.",
        );
        return;
      }
      setRows(parsed);
      setResults([]);
      setSkippedOnLoad(skippedCount);
      if (skippedCount > 0) {
        toast.success(`${skippedCount} ${t("import.skippedRefunded")}`);
      }
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const { parsed, skippedCount } = rowsToParsed(res.data);
        if (parsed.length === 0) {
          toast.error(
            "No valid rows found. Expected columns: اسم الطالب, رقم الطالب, 4x6 صورة شخصية, الخط.",
          );
          return;
        }
        setRows(parsed);
        setResults([]);
        setSkippedOnLoad(skippedCount);
        if (skippedCount > 0) {
          toast.success(`${skippedCount} ${t("import.skippedRefunded")}`);
        }
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
    const updatedCount = created.filter((r) => r.status === "updated").length;
    const createdCount = created.length - failCount - updatedCount;
    const parts = [
      createdCount > 0 ? `${createdCount} ${t("import.accountsCreated")}` : null,
      updatedCount > 0 ? `${updatedCount} ${t("import.updated")}` : null,
      failCount > 0 ? `${failCount} ${t("import.failed").toLowerCase()}` : null,
      skippedOnLoad > 0 ? `${skippedOnLoad} ${t("import.skippedRefunded")}` : null,
    ].filter(Boolean);
    toast.success(parts.join(", "));
  };

  const downloadCredentials = () => {
    const csv = Papa.unparse(
      results.map((r) => ({
        Name: r.full_name,
        Phone: excelTextCell(r.phone),
        Username: r.username,
        "Login Email": r.email,
        "Temporary Password": r.temp_password,
        Status: r.status,
      })),
    );
    const blob = new Blob([withUtf8Bom(csv)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "waleed-talaat-new-accounts.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">{t("import.bulkTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the roster sheet (.xlsx or .csv) with columns: <code dir="rtl">اسم الطالب</code>,{" "}
          <code dir="rtl">رقم الطالب</code>, <code dir="rtl">4x6 صورة شخصية</code>,{" "}
          <code dir="rtl">الخط</code>, and <code dir="rtl">برجاء الاختيار من الآتي</code> for the
          subscription plan — matched by keyword, not exact wording, so any phrasing containing قسط
          / سداد / كامل / مسدد / 70 / رحلة / أسبوعي / اسبوعي / دحيحة is read correctly. Payment
          amount, receipt and other columns are ignored automatically. A row whose phone number
          already matches an existing student updates that student's profile instead of creating a
          duplicate account — remaining trip balance is never touched by an update, but
          subscription/payment fields are refreshed, so re-uploading the same corrected sheet fixes
          any student who previously imported with the wrong plan. Rows mentioning مسترد / استرداد /
          ملغي / refunded / cancelled anywhere, or manually filled with a red cell color, are
          skipped automatically. Note: colors applied via Excel's Conditional Formatting rules
          (rather than a manually-set cell fill) can't be detected this way — add one of the
          keywords above too for those rows to guarantee they're skipped.
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
            <Upload className="size-4" /> {t("import.chooseFile")}
          </Button>
          {rows.length > 0 && (
            <Button className="btn-gold" disabled={busy} onClick={() => void createAccounts()}>
              <UserPlus className="size-4" /> {t("import.createAccounts")} ({rows.length})
            </Button>
          )}
          {results.length > 0 && (
            <Button variant="secondary" onClick={downloadCredentials}>
              <Download className="size-4" /> {t("import.downloadCredentials")}
            </Button>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="overflow-x-auto rounded-3xl border border-border bg-card p-6">
          <h3 className="mb-4 font-semibold">{t("import.previewTitle")}</h3>
          {skippedOnLoad > 0 && (
            <p className="mb-3 text-sm text-destructive">
              🔴 {skippedOnLoad} {t("import.skippedRefunded")}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("import.photo")}</TableHead>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("import.plan")}</TableHead>
                <TableHead>{t("import.username")}</TableHead>
                <TableHead>{t("import.tempPassword")}</TableHead>
                {results.length > 0 && <TableHead>{t("common.status")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const outcome = results.find((res) => res.phone === r.phone);
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
                              email: outcome.email || `${r.username}@wt-shuttle.app`,
                              temp_password: r.temp_password,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-success underline underline-offset-2"
                          >
                            {t("import.sendWhatsapp")}
                          </a>
                        ) : outcome?.status === "updated" ? (
                          <span className="text-accent">{t("import.updated")}</span>
                        ) : outcome ? (
                          <span className="text-destructive" title={outcome.error}>
                            {t("import.failed")}
                            {outcome.error ? `: ${outcome.error}` : ""}
                          </span>
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

      <RecoverCredentialsPanel />
    </div>
  );
}
