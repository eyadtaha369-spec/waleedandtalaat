import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";

export const Route = createFileRoute("/change-password")({
  head: () => ({ meta: [{ title: "Set a new password — Waleed & Talaat" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, profile, loading, refresh } = useAuth();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    // Nothing to do here if this student already changed their
    // password (or this is a staff account, which never needs to).
    if (!profile?.must_change_password) {
      void navigate({ to: "/dashboard" });
    }
  }, [loading, user, profile, navigate]);

  const submit = async () => {
    if (password.length < 6) {
      toast.error(t("changePassword.tooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("changePassword.mismatch"));
      return;
    }
    if (password === "wt@2027") {
      toast.error(t("changePassword.sameAsDefault"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const { error: flagError } = await supabase.rpc("mark_password_changed");
    setBusy(false);
    if (flagError) {
      toast.error(flagError.message);
      return;
    }
    toast.success(t("changePassword.success"));
    await refresh();
    void navigate({ to: "/dashboard" });
  };

  return (
    <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-14">
      <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-card-foreground">
        <div className="flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-4 text-2xl font-bold">{t("changePassword.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("changePassword.subtitle")}</p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>{t("changePassword.newPassword")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("changePassword.confirmPassword")}</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button className="btn-gold w-full" disabled={busy} onClick={() => void submit()}>
            {t("changePassword.submit")}
          </Button>
        </div>
      </div>
    </main>
  );
}
