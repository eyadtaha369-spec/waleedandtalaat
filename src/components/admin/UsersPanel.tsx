import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Power, ShieldCheck, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { generateTempPassword } from "@/lib/credentials";
import { edgeFunctionErrorMessage } from "@/lib/functionsError";
import { useLanguage } from "@/hooks/useLanguage";

type StaffUser = {
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string;
  role: "admin" | "supervisor";
  is_active: boolean;
};

const emptyCreateForm: {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  role: "admin" | "supervisor";
} = {
  full_name: "",
  phone: "",
  email: "",
  password: "",
  role: "supervisor",
};

export function UsersPanel() {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);

  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    phone: "",
    role: "supervisor" as string,
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_staff_users");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setUsers((data as StaffUser[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async () => {
    if (!createForm.full_name || !createForm.email || !createForm.password) {
      toast.error(t("users.fullNameEmailPasswordRequired"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "create", ...createForm },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, t("users.createError"))));
      return;
    }
    toast.success(
      createForm.role === "admin"
        ? t("users.adminAccountCreated")
        : t("users.supervisorAccountCreated"),
    );
    setCreateOpen(false);
    setCreateForm(emptyCreateForm);
    void load();
  };

  const openEdit = (u: StaffUser) => {
    setEditUser(u);
    setEditForm({ full_name: u.full_name, phone: u.phone ?? "", role: u.role });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setBusy(true);
    const { error } = await supabase.rpc("update_staff_user", {
      p_user_id: editUser.user_id,
      p_full_name: editForm.full_name,
      p_phone: editForm.phone,
      p_role: editForm.role,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("users.updated"));
    setEditUser(null);
    void load();
  };

  const resetPassword = async (u: StaffUser) => {
    const newPassword = generateTempPassword();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "reset_password", user_id: u.user_id, new_password: newPassword },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(
        data?.error ?? (await edgeFunctionErrorMessage(error, t("users.resetPasswordError"))),
      );
      return;
    }
    toast.success(`${t("users.newPasswordFor")} ${u.full_name}: ${newPassword}`, {
      duration: 15000,
    });
  };

  const toggleActive = async (u: StaffUser) => {
    if (u.user_id === currentUser?.id) {
      toast.error(t("users.cantDeactivateSelf"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "set_active", user_id: u.user_id, active: !u.is_active },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(data?.error ?? (await edgeFunctionErrorMessage(error, t("users.statusError"))));
      return;
    }
    toast.success(u.is_active ? t("users.accountDeactivated") : t("users.accountReactivated"));
    void load();
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-accent size-5" />
          <h2 className="font-semibold">{t("users.adminsSupervisors")}</h2>
        </div>
        <Button size="sm" className="btn-gold" onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" /> {t("users.newAdminSupervisor")}
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("users.noAccounts")}</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("auth.email")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell>{u.phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      u.role === "admin"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-accent text-accent-foreground"
                    }
                  >
                    {u.role === "admin" ? `🔴 ${t("users.admin")}` : `🔵 ${t("users.supervisor")}`}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      u.is_active
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {u.is_active ? t("users.active") : t("users.deactivated")}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => openEdit(u)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void resetPassword(u)}
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || u.user_id === currentUser?.id}
                      title={
                        u.user_id === currentUser?.id ? t("users.cantDeactivateOwn") : undefined
                      }
                      onClick={() => void toggleActive(u)}
                    >
                      <Power className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.newAdminSupervisor")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field
              label={t("auth.fullName")}
              value={createForm.full_name}
              onChange={(v) => setCreateForm({ ...createForm, full_name: v })}
            />
            <Field
              label={t("users.whatsappPhone")}
              value={createForm.phone}
              onChange={(v) => setCreateForm({ ...createForm, phone: v })}
            />
            <Field
              label={t("users.emailUsername")}
              type="email"
              value={createForm.email}
              onChange={(v) => setCreateForm({ ...createForm, email: v })}
            />
            <div className="space-y-2">
              <Label>{t("users.password")}</Label>
              <div className="flex gap-2">
                <Input
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateForm({ ...createForm, password: generateTempPassword() })}
                >
                  {t("users.generate")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("users.role")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm({ ...createForm, role: e.target.value as "admin" | "supervisor" })
                }
              >
                <option value="admin">{t("users.admin")}</option>
                <option value="supervisor">{t("users.supervisor")}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button className="btn-gold w-full" disabled={busy} onClick={() => void createUser()}>
              {t("users.createAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("users.editUserTitle")} {editUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field
              label={t("auth.fullName")}
              value={editForm.full_name}
              onChange={(v) => setEditForm({ ...editForm, full_name: v })}
            />
            <Field
              label={t("users.whatsappPhone")}
              value={editForm.phone}
              onChange={(v) => setEditForm({ ...editForm, phone: v })}
            />
            <div className="space-y-2">
              <Label>{t("users.role")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                <option value="admin">{t("users.admin")}</option>
                <option value="supervisor">{t("users.supervisor")}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button className="btn-gold w-full" disabled={busy} onClick={() => void saveEdit()}>
              {t("users.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
