import { useState } from "react";
import { toast } from "sonner";
import { Download, KeyRound, RefreshCw } from "lucide-react";
import Papa from "papaparse";
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
import { generateTempPassword, credentialsWhatsAppLink } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";

type Student = {
  user_id: string;
  full_name: string;
  phone: string | null;
  username: string | null;
  email: string;
};

type ResetResult = Student & { new_password: string; status: "reset" | "failed" };

export function RecoverCredentialsPanel() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [results, setResults] = useState<ResetResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_students_for_credentials");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as Student[]) ?? []);
    setResults([]);
  };

  const resetAll = async () => {
    if (!students || students.length === 0) return;
    setBusy(true);
    const withNewPasswords = students.map((s) => ({ ...s, new_password: generateTempPassword() }));

    const { data, error } = await supabase.functions.invoke("reset-student-passwords", {
      body: {
        students: withNewPasswords.map((s) => ({
          user_id: s.user_id,
          new_password: s.new_password,
        })),
      },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not reset passwords")),
      );
      return;
    }
    const statusById = new Map(
      ((data?.results as { user_id: string; status: "reset" | "failed" }[]) ?? []).map((r) => [
        r.user_id,
        r.status,
      ]),
    );
    const merged: ResetResult[] = withNewPasswords.map((s) => ({
      ...s,
      status: statusById.get(s.user_id) ?? "failed",
    }));
    setResults(merged);
    const failCount = merged.filter((r) => r.status === "failed").length;
    toast.success(
      failCount === 0
        ? `${merged.length} passwords reset`
        : `${merged.length - failCount} reset, ${failCount} failed`,
    );
  };

  const downloadCredentials = () => {
    const csv = Papa.unparse(
      results.map((r) => ({
        Name: r.full_name,
        Phone: r.phone ?? "",
        Username: r.username ?? "",
        "Login Email": r.email,
        "New Password": r.new_password,
        Status: r.status,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "waleed-talaat-recovered-credentials.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-semibold">Recover credentials for existing students</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        For accounts already created whose original username/password were never sent out — the
        original password can't be recovered (it's hashed), so this generates a fresh one for every
        listed student.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => void loadStudents()} disabled={loading}>
          <RefreshCw className="size-4" /> Load students
        </Button>
        {students && students.length > 0 && (
          <Button className="btn-gold" disabled={busy} onClick={() => void resetAll()}>
            <KeyRound className="size-4" /> Generate new passwords for {students.length} student
            {students.length === 1 ? "" : "s"}
          </Button>
        )}
        {results.length > 0 && (
          <Button variant="secondary" onClick={downloadCredentials}>
            <Download className="size-4" /> Download credentials sheet
          </Button>
        )}
      </div>

      {students && (
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>New password</TableHead>
                {results.length > 0 && <TableHead>Send</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(results.length > 0 ? results : students).map((s) => {
                const r = results.find((res) => res.user_id === s.user_id);
                return (
                  <TableRow key={s.user_id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.email}</TableCell>
                    <TableCell className="font-mono text-xs">{r ? r.new_password : "—"}</TableCell>
                    {results.length > 0 && (
                      <TableCell>
                        {r?.status === "reset" ? (
                          <a
                            href={credentialsWhatsAppLink({
                              full_name: r.full_name,
                              phone: r.phone ?? "",
                              email: r.email,
                              temp_password: r.new_password,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-success underline underline-offset-2"
                          >
                            Send on WhatsApp
                          </a>
                        ) : r ? (
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
        </div>
      )}
    </section>
  );
}
