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

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Waleed & Talaat Shuttle" },
      {
        name: "description",
        content: "Student and supervisor sign in for the Waleed & Talaat shuttle service.",
      },
      { property: "og:title", content: "Sign in — Waleed & Talaat Shuttle" },
      { property: "og:description", content: "Access your shuttle bookings and boarding pass." },
    ],
  }),
  component: AuthPage,
});

// Self-signup is intentionally removed: accounts are only ever issued
// by an admin (bulk import or manual credential reset). If someone
// still needs to sign up directly via the Supabase API despite this,
// disable "Allow new users to sign up" in the Supabase dashboard under
// Authentication → Settings — that's the actual enforcement; this page
// just no longer offers the option.
function AuthPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isSupervisor, loading } = useAuth();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (loading || !user) return;
    if (isAdmin) void navigate({ to: "/admin" });
    else if (isSupervisor) void navigate({ to: "/admin/scan" });
    else void navigate({ to: "/dashboard" });
  }, [loading, user, isAdmin, isSupervisor, navigate]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.welcomeBack"));
    // Redirect is handled by the effect above once roles finish loading.
  };

  return (
    <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-14">
      <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-card-foreground">
        <div className="flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-4 text-2xl font-bold">Waleed &amp; Talaat</h1>
          <p className="text-sm text-muted-foreground">Student & supervisor access</p>
        </div>

        <div className="mt-6 space-y-4">
          <Field label={t("auth.email")} value={email} onChange={setEmail} type="email" />
          <Field
            label={t("auth.password")}
            value={password}
            onChange={setPassword}
            type="password"
          />
          <Button className="btn-gold w-full" disabled={busy} onClick={() => void signIn()}>
            {t("auth.signIn")}
          </Button>
        </div>
      </div>
    </main>
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
