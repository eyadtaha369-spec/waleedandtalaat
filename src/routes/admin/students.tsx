import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ArrowLeft, MessageCircle, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartAvatar } from "@/components/SmartAvatar";
import { subscriptionBadge } from "@/lib/subscription";
import { generateTempPassword, credentialsWhatsAppLink } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";

export const Route = createFileRoute("/admin/students")({
  head: () => ({ meta: [{ title: "Student directory — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard requireAdmin>
      <AdminStudentsPage />
    </AdminGuard>
  ),
});

type StudentRow = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  pickup_stop: string | null;
  subscription_type: string;
  payment_status: string;
  trips_remaining: number;
  trips_total: number;
  whatsapp_invited_at: string | null;
  username: string | null;
  photo_url: string | null;
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Extracts phone numbers from a roster file, reusing the same header
 * spellings the bulk-import tool understands. */
async function extractPhonesFromFile(file: File): Promise<Set<string>> {
  const phones = new Set<string>();
  const pull = (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const keys = ["رقم الطالب", "WhatsApp Number", "Phone"];
      let raw = "";
      for (const k of keys) {
        if (r[k]) {
          raw = String(r[k]).trim();
          break;
        }
      }
      if (!raw) {
        const found = Object.keys(r).find((rk) => rk.includes("رقم الطالب"));
        if (found && r[found]) raw = String(r[found]).trim();
      }
      const norm = normalizePhone(raw);
      if (norm) phones.add(norm);
    }
  };

  if (/\.xlsx?$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (sheet) pull(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
  } else {
    await new Promise<void>((resolve) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          pull(res.data);
          resolve();
        },
      });
    });
  }
  return phones;
}

function AdminStudentsPage() {
  const { t } = useLanguage();
  const { routes } = useRoutes();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Audit-against-file tool
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<StudentRow[] | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const auditFileRef = useRef<HTMLInputElement>(null);

  const load = async (route: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_all_students", {
      p_route: route === "all" ? null : route,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as StudentRow[]) ?? []);
  };

  useEffect(() => {
    void load(routeFilter);
  }, [routeFilter]);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone ?? "").includes(q);
  });

  const sendCredentials = async (s: StudentRow) => {
    if (!s.username || !s.phone) return;
    setBusyId(s.user_id);
    const newPassword = generateTempPassword();
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_password", user_id: s.user_id, new_password: newPassword },
    });
    setBusyId(null);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not reset password")),
      );
      return;
    }
    const link = credentialsWhatsAppLink({
      full_name: s.full_name,
      phone: s.phone,
      email: `${s.username}@wt-shuttle.app`,
      temp_password: newPassword,
    });
    window.open(link, "_blank");
    toast.success(t("students.credentialsSent"));
  };

  const runAudit = async (file: File) => {
    setAuditing(true);
    const filePhones = await extractPhonesFromFile(file);
    setAuditing(false);
    if (filePhones.size === 0) {
      toast.error("Could not find any phone numbers in that file.");
      return;
    }
    const missing = students.filter((s) => {
      const p = s.phone ? normalizePhone(s.phone) : "";
      return !p || !filePhones.has(p);
    });
    setAuditResult(missing);
    setSelectedForDelete(new Set());
  };

  const toggleAuditSelect = (id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedForDelete.size === 0) return;
    if (!window.confirm(t("students.confirmDelete"))) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-students", {
      body: { user_ids: [...selectedForDelete] },
    });
    setDeleting(false);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not delete accounts")),
      );
      return;
    }
    const deletedIds = new Set(
      (data.results as { user_id: string; deleted: boolean }[])
        .filter((r) => r.deleted)
        .map((r) => r.user_id),
    );
    toast.success(`${deletedIds.size} ${t("students.deletedCount")}`);
    setStudents((prev) => prev.filter((s) => !deletedIds.has(s.user_id)));
    setAuditResult((prev) => prev?.filter((s) => !deletedIds.has(s.user_id)) ?? null);
    setSelectedForDelete(new Set());
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">Admin</p>
          <h1 className="text-2xl font-bold">{t("students.masterDirectory")}</h1>
        </div>
        <Link to="/admin" className="text-sm text-white/80 hover:text-white">
          <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-dashed border-accent/60 bg-accent/5 p-5">
        <p className="font-semibold">{t("students.auditTool")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("students.auditDesc")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={auditFileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void runAudit(e.target.files[0])}
          />
          <Button
            variant="outline"
            disabled={auditing}
            onClick={() => auditFileRef.current?.click()}
          >
            <Search className="size-4" /> {t("students.auditUpload")}
          </Button>
          {auditResult !== null && (
            <Badge
              className={
                auditResult.length > 0
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-success text-success-foreground"
              }
            >
              {auditResult.length > 0
                ? `${auditResult.length} ${t("students.auditResult")}`
                : t("students.noExtra")}
            </Badge>
          )}
          {selectedForDelete.size > 0 && (
            <Button variant="destructive" disabled={deleting} onClick={() => void deleteSelected()}>
              <Trash2 className="size-4" /> {t("students.deleteSelected")} ({selectedForDelete.size}
              )
            </Button>
          )}
        </div>

        {auditResult && auditResult.length > 0 && (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("students.source")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditResult.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedForDelete.has(s.user_id)}
                      onChange={() => toggleAuditSelect(s.user_id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.route ?? "—"}</TableCell>
                  <TableCell>
                    {s.username ? t("students.sourceBulkImport") : t("students.sourceSelfSignup")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
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
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Badge className="btn-gold">{filtered.length}</Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("students.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("common.route")}</TableHead>
                <TableHead>{t("dashboard.subscription")}</TableHead>
                <TableHead>{t("students.username")}</TableHead>
                <TableHead>{t("students.source")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const badge = subscriptionBadge(s.subscription_type, s.payment_status);
                return (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      <div className="size-8 overflow-hidden rounded-full">
                        <SmartAvatar
                          photoUrl={s.photo_url}
                          name={s.full_name}
                          className="size-full text-[10px]"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.route ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={badge.className}>
                        {badge.emoji} {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.username ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {s.username ? t("students.sourceBulkImport") : t("students.sourceSelfSignup")}
                    </TableCell>
                    <TableCell className="text-end">
                      {s.username && s.phone && (
                        <Button
                          size="sm"
                          className="bg-success text-success-foreground hover:bg-success/90"
                          disabled={busyId === s.user_id}
                          onClick={() => void sendCredentials(s)}
                        >
                          <MessageCircle className="size-4" /> {t("students.sendCredentials")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
