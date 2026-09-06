import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoutes } from "@/hooks/useRoutes";
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

function AuthPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isSupervisor, loading } = useAuth();
  const { routes, stopsByRoute } = useRoutes();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [route, setRoute] = useState<string>("");
  const [pickupStop, setPickupStop] = useState<string>("");

  useEffect(() => {
    if (!route && routes.length > 0) {
      setRoute(routes[0]!);
      setPickupStop(stopsByRoute[routes[0]!]?.[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

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

  const signUp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName,
          phone,
          route,
          pickup_stop: pickupStop,
          subscription_type: "full_term",
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.accountCreated"));
  };

  return (
    <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-14">
      <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-card-foreground">
        <div className="flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-4 text-2xl font-bold">Waleed &amp; Talaat</h1>
          <p className="text-sm text-muted-foreground">Student & supervisor access</p>
        </div>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
            <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 pt-4">
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
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 pt-4">
            <Field label={t("auth.fullName")} value={fullName} onChange={setFullName} />
            <Field label={t("auth.phone")} value={phone} onChange={setPhone} />
            <div className="space-y-2">
              <Label>{t("auth.route")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={route}
                onChange={(e) => {
                  setRoute(e.target.value);
                  setPickupStop(stopsByRoute[e.target.value]?.[0] ?? "");
                }}
              >
                {routes.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("auth.pickupStop")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickupStop}
                onChange={(e) => setPickupStop(e.target.value)}
              >
                {(stopsByRoute[route] ?? []).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <Field label={t("auth.email")} value={email} onChange={setEmail} type="email" />
            <Field
              label={t("auth.password")}
              value={password}
              onChange={setPassword}
              type="password"
            />
            <Button className="btn-gold w-full" disabled={busy} onClick={() => void signUp()}>
              {t("auth.signUp")}
            </Button>
          </TabsContent>
        </Tabs>
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
