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

type AuthLikeError =
  | { message?: string | undefined; code?: string | undefined; status?: number | undefined }
  | null
  | undefined;

// Two distinct failure shapes land here: supabase-js throwing
// AuthSessionMissingError (no local session at all), and a server-side
// revoke (admin credential reset, or a logout elsewhere) that still
// leaves a local session behind but makes the server reject it with
// session_not_found / 401 / 403 — a getSession() check alone misses
// the second case, so both must be mapped to the same recovery path.
function isSessionLostError(error: AuthLikeError): boolean {
  if (!error) return false;
  if (error.message?.includes("Auth session missing")) return true;
  if (error.code === "session_not_found") return true;
  if (error.status === 401 || error.status === 403) return true;
  return false;
}

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

  const handleSessionLost = async () => {
    toast.error(t("changePassword.sessionLost"));
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    void navigate({ to: "/auth" });
  };

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
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        await handleSessionLost();
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (isSessionLostError(error)) {
          await handleSessionLost();
          return;
        }
        if (error.code === "same_password") {
          toast.error(t("changePassword.samePassword"));
          return;
        }
        if (error.code === "weak_password") {
          toast.error(t("changePassword.weakPassword"));
          return;
        }
        if (error.code === "over_request_rate_limit" || error.status === 429) {
          toast.error(t("changePassword.rateLimited"));
          return;
        }
        toast.error(t("changePassword.genericError"));
        return;
      }

      const { error: flagError } = await supabase.rpc("mark_password_changed");
      if (flagError) {
        if (isSessionLostError(flagError)) {
          await handleSessionLost();
          return;
        }
        toast.error(t("changePassword.genericError"));
        return;
      }

      toast.success(t("changePassword.success"));
      await refresh();
      void navigate({ to: "/dashboard" });
    } catch {
      toast.error(t("auth.connectionError"));
    } finally {
      setBusy(false);
    }
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
