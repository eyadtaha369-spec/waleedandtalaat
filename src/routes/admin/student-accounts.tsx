import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SmartAvatar } from "@/components/SmartAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { mapSubscriptionChoice } from "@/lib/subscription";
import { subscriptionBadge } from "@/lib/subscription";

const DEFAULT_PASSWORD = "wt@2027";

const PLAN_CHOICES = [
  { value: "سداد كامل", label: "اشتراك ترم كامل" },
  { value: "قسط", label: "اشتراك أقساط" },
  { value: "اسبوعي", label: "اشتراك أسبوعي" },
  { value: "70 رحلة", label: "باقة 70 رحلة" },
  { value: "عرض الدحيحة", label: "عرض الطالب المتفوق" },
];

export const Route = createFileRoute("/admin/student-accounts")({
  head: () => ({ meta: [{ title: "Student Accounts — Waleed & Talaat" }] }),
  component: () => (
    <AdminGuard>
      <StudentAccountsPage />
    </AdminGuard>
  ),
});

type StudentAccount = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  photo_url: string | null;
  must_change_password: boolean;
  subscription_type: string;
};

type StudentForm = {
  user_id?: string;
  full_name: string;
  phone: string;
  route: string;
  plan_choice: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function StudentAccountsPage() {
  const { isAdmin, profile } = useAuth();
  const { t } = useLanguage();
  const { routes } = useRoutes();

  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [form, setForm] = useState<StudentForm>({
    full_name: "",
    phone: "",
    route: "",
    plan_choice: PLAN_CHOICES[0]!.value,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const effectiveRoute = isAdmin ? routeFilter : (profile?.assigned_route ?? "");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_route_student_accounts", {
      p_route: !effectiveRoute || effectiveRoute === "all" ? null : effectiveRoute,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as StudentAccount[]) ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoute]);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone ?? "").includes(q);
  });

  const copyDefault = async () => {
    await navigator.clipboard.writeText(DEFAULT_PASSWORD);
    toast.success(t("studentAccounts.copied"));
  };

  const resetToDefault = async (s: StudentAccount) => {
    if (!window.confirm(t("studentAccounts.confirmReset"))) return;
    setBusyId(s.user_id);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_password", user_id: s.user_id, new_password: DEFAULT_PASSWORD },
    });
    if (error || data?.error) {
      setBusyId(null);
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not reset password")),
      );
      return;
    }
    const { error: flagError } = await supabase.rpc("flag_password_reset", {
      p_student_id: s.user_id,
    });
    setBusyId(null);
    if (flagError) {
      toast.error(flagError.message);
      return;
    }
    setStudents((prev) =>
      prev.map((x) => (x.user_id === s.user_id ? { ...x, must_change_password: true } : x)),
    );
    toast.success(t("studentAccounts.resetDone"));
  };

  const migrateAllExisting = async () => {
    const confirmed = window.confirm(t("studentAccounts.confirmMigrateAll"));
    if (!confirmed) return;
    setMigrating(true);
    setMigrationSummary(null);
    const { data, error } = await supabase.functions.invoke("migrate-students-to-phone-login");
    setMigrating(false);
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, "Migration failed")));
      return;
    }
    const results = (data.results as { status: string }[]) ?? [];
    const migrated = results.filter((r) => r.status === "migrated").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;
    setMigrationSummary(
      `${migrated} ${t("studentAccounts.migrated")}, ${skipped} ${t("studentAccounts.migSkipped")}, ${failed} ${t("studentAccounts.migFailed")}`,
    );
    toast.success(t("studentAccounts.migrationDone"));
    void load();
  };

  const [repairing, setRepairing] = useState(false);
  const [repairSummary, setRepairSummary] = useState<string | null>(null);

  const repairLogins = async () => {
    setRepairing(true);
    setRepairSummary(null);
    const { data, error } = await supabase.functions.invoke("repair-student-logins");
    setRepairing(false);
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, "Repair failed")));
      return;
    }
    const results = (data.results as { status: string }[]) ?? [];
    const repaired = results.filter((r) => r.status === "repaired").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;
    setRepairSummary(
      `${repaired} ${t("studentAccounts.repaired")}, ${skipped} ${t("studentAccounts.migSkipped")}, ${failed} ${t("studentAccounts.migFailed")}`,
    );
    toast.success(t("studentAccounts.repairDone"));
  };

  const openCreate = () => {
    setForm({
      full_name: "",
      phone: "",
      route: isAdmin ? (routes[0] ?? "") : (profile?.assigned_route ?? ""),
      plan_choice: PLAN_CHOICES[0]!.value,
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormOpen(true);
  };

  const openEdit = (s: StudentAccount) => {
    setForm({
      user_id: s.user_id,
      full_name: s.full_name,
      phone: s.phone ?? "",
      route: s.route ?? "",
      plan_choice: PLAN_CHOICES[0]!.value,
    });
    setPhotoFile(null);
    setPhotoPreview(s.photo_url);
    setFormOpen(true);
  };

  const onPhotoSelected = (file: File | null) => {
    setPhotoFile(file);
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  const saveStudent = async () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.route) {
      toast.error(t("studentAccounts.formRequired"));
      return;
    }
    setFormSaving(true);

    const isEdit = !!form.user_id;
    const plan = mapSubscriptionChoice(form.plan_choice);

    let photoUrl: string | undefined;
    if (photoFile) {
      // A brand-new student doesn't have an id yet to scope the photo
      // path to until the account itself is created, so for a create
      // we upload the photo AFTER the account exists, then patch it in.
      if (isEdit) {
        const uploaded = await uploadPhoto(form.user_id!, photoFile);
        if (uploaded === null) {
          setFormSaving(false);
          return;
        }
        photoUrl = uploaded;
      }
    }

    if (isEdit) {
      const { error } = await supabase.functions.invoke("update-student", {
        body: {
          student_id: form.user_id,
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          route: form.route,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          subscription_type: plan.subscription_type,
          payment_status: plan.payment_status,
          installment_status: plan.installment_status,
          ...(plan.trips_total !== undefined ? { trips_total: plan.trips_total } : {}),
        },
      });
      setFormSaving(false);
      if (error) {
        toast.error(await edgeFunctionErrorMessage(error, "Could not update student"));
        return;
      }
      toast.success(t("studentAccounts.updated"));
    } else {
      const { data, error } = await supabase.functions.invoke("create-student", {
        body: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          route: form.route,
          subscription_type: plan.subscription_type,
          payment_status: plan.payment_status,
          installment_status: plan.installment_status,
          trips_total: plan.trips_total ?? 0,
        },
      });
      if (error || data?.error) {
        setFormSaving(false);
        toast.error(
          data?.error ?? (await edgeFunctionErrorMessage(error, "Could not create student")),
        );
        return;
      }
      if (photoFile && data?.user_id) {
        const uploaded = await uploadPhoto(data.user_id, photoFile);
        if (uploaded) {
          await supabase.functions.invoke("update-student", {
            body: { student_id: data.user_id, photo_url: uploaded },
          });
        }
      }
      setFormSaving(false);
      toast.success(t("studentAccounts.created"));
    }

    setFormOpen(false);
    void load();
  };

  const uploadPhoto = async (studentId: string, file: File): Promise<string | null> => {
    const base64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke("upload-student-photo", {
      body: {
        student_id: studentId,
        file_base64: base64,
        file_name: file.name,
        content_type: file.type,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, "Could not upload photo")));
      return null;
    }
    return data.photo_url as string;
  };

  const deleteStudent = async (s: StudentAccount) => {
    if (!window.confirm(t("studentAccounts.confirmDelete"))) return;
    setBusyId(s.user_id);
    const { data, error } = await supabase.functions.invoke("delete-students", {
      body: { user_ids: [s.user_id] },
    });
    setBusyId(null);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, "Could not delete student")),
      );
      return;
    }
    setStudents((prev) => prev.filter((x) => x.user_id !== s.user_id));
    toast.success(t("studentAccounts.deleted"));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="surface-navy shadow-luxe flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <p className="text-xs tracking-[0.25em] uppercase opacity-70">
            {isAdmin ? "Admin" : "Supervisor"}
          </p>
          <h1 className="text-2xl font-bold">{t("studentAccounts.title")}</h1>
        </div>
        {isAdmin && (
          <Link to="/admin" className="text-sm text-white/80 hover:text-white">
            <ArrowLeft className="me-1 inline size-4" /> {t("common.backToConsole")}
          </Link>
        )}
      </div>

      {isAdmin && (
        <div className="mt-6 rounded-3xl border-2 border-destructive/50 bg-destructive/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-5" /> {t("studentAccounts.migrateAllTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("studentAccounts.migrateAllDesc")}
          </p>
          <Button
            variant="destructive"
            className="mt-3"
            disabled={migrating}
            onClick={() => void migrateAllExisting()}
          >
            {migrating ? t("common.loading") : t("studentAccounts.migrateAllButton")}
          </Button>
          {migrationSummary && <p className="mt-3 text-sm font-medium">{migrationSummary}</p>}
        </div>
      )}

      {isAdmin && (
        <div className="mt-6 rounded-3xl border-2 border-warning/50 bg-warning/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-warning-foreground">
            <AlertTriangle className="size-5" /> {t("studentAccounts.repairTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("studentAccounts.repairDesc")}</p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={repairing}
            onClick={() => void repairLogins()}
          >
            {repairing ? t("common.loading") : t("studentAccounts.repairButton")}
          </Button>
          {repairSummary && <p className="mt-3 text-sm font-medium">{repairSummary}</p>}
        </div>
      )}

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
          <Button variant="outline" onClick={() => void copyDefault()}>
            <Copy className="size-4" /> {t("studentAccounts.copyDefault")}
          </Button>
          <Button className="btn-gold ms-auto" onClick={openCreate}>
            <Plus className="size-4" /> {t("studentAccounts.addStudent")}
          </Button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("studentAccounts.noStudents")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                {isAdmin && routeFilter === "all" && <TableHead>{t("common.route")}</TableHead>}
                <TableHead>{t("dashboard.subscription")}</TableHead>
                <TableHead>{t("studentAccounts.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const badge = subscriptionBadge(s.subscription_type, "paid_full");
                return (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      <div className="size-9 overflow-hidden rounded-full">
                        <SmartAvatar
                          photoUrl={s.photo_url}
                          name={s.full_name}
                          className="size-full text-xs"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                    {isAdmin && routeFilter === "all" && <TableCell>{s.route ?? "—"}</TableCell>}
                    <TableCell>
                      <Badge className={badge.className}>
                        {badge.emoji} {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.must_change_password ? (
                        <Badge className="bg-warning text-warning-foreground">
                          {t("studentAccounts.defaultPassword")}
                        </Badge>
                      ) : (
                        <Badge className="bg-success text-success-foreground">
                          {t("studentAccounts.changed")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === s.user_id}
                          onClick={() => void resetToDefault(s)}
                        >
                          <RotateCcw className="size-4" /> {t("studentAccounts.resetToDefault")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === s.user_id}
                          onClick={() => void deleteStudent(s)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.user_id ? t("studentAccounts.editStudent") : t("studentAccounts.addStudent")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-full border border-border">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-secondary">
                    <UserRound className="size-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
              >
                {t("studentAccounts.uploadPhoto")}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.phone")}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.route")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
                disabled={!isAdmin}
              >
                {(isAdmin ? routes : [profile?.assigned_route ?? ""]).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.subscription")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.plan_choice}
                onChange={(e) => setForm({ ...form, plan_choice: e.target.value })}
              >
                {PLAN_CHOICES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="btn-gold w-full"
              disabled={formSaving}
              onClick={() => void saveStudent()}
            >
              {t("studentAccounts.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
