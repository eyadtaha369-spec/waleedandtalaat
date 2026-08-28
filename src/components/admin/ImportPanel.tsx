import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Download, Upload, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

type ParsedRow = {
  full_name: string;
  phone: string;
  route: string;
  pickup_stop: string;
  subscription_type: "full_term" | "package";
  trips_total: number;
  username: string;
  temp_password: string;
};

type ImportResult = {
  full_name: string;
  username: string;
  email: string;
  temp_password: string;
  status: "created" | "failed";
  error?: string;
};

function normalizeSubscription(raw: string): "full_term" | "package" {
  const v = raw.trim().toLowerCase();
  return v.includes("package") || v.includes("70") ? "package" : "full_term";
}

export function ImportPanel() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed: ParsedRow[] = res.data
          .filter((r) => (r["Name"] || r["Full Name"] || "").trim())
          .map((r, i) => {
            const name = (r["Name"] ?? r["Full Name"] ?? "").trim();
            return {
              full_name: name,
              phone: (r["WhatsApp Number"] ?? r["Phone"] ?? "").trim(),
              route: (r["Route"] ?? "").trim(),
              pickup_stop: (r["Pickup Stop"] ?? "").trim(),
              subscription_type: normalizeSubscription(r["Subscription Type"] ?? "full_term"),
              trips_total: Number(r["Initial Trips Count"] ?? r["Trips"] ?? 0) || 0,
              username: generateUsername(name, i),
              temp_password: generateTempPassword(),
            };
          });
        if (parsed.length === 0) {
          toast.error(
            "No valid rows found. Expected columns: Name, WhatsApp Number, Route, Pickup Stop, Subscription Type, Initial Trips Count.",
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
          Upload a CSV with columns: <code>Name</code>, <code>WhatsApp Number</code>,{" "}
          <code>Route</code>, <code>Pickup Stop</code>, <code>Subscription Type</code> (Full Term or
          70-Trip Package), <code>Initial Trips Count</code>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Choose CSV file
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
                <TableHead>Name</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Subscription</TableHead>
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
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.route || "—"}</TableCell>
                    <TableCell>
                      {r.subscription_type === "package" ? "70-Trip Package" : "Full Term"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.username}</TableCell>
                    <TableCell className="font-mono text-xs">{r.temp_password}</TableCell>
                    {results.length > 0 && (
                      <TableCell>
                        {outcome?.status === "created" ? (
                          <span className="text-success">Created</span>
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
