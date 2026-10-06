import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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

const SIGN_IN_TIMEOUT_MS = 10000;

// 28 accounts in prod were stored without the leading 0 on their phone
// number — try the digits as typed first, then the alternate form
// (leading 0 added/removed) only if the first attempt is specifically
// an "invalid_credentials" response, not a network/timeout error.
function normalizePhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 11) {
    if (digits.startsWith("0020")) digits = digits.slice(4);
    else if (digits.startsWith("20")) digits = digits.slice(2);
  }
  return digits;
}

function buildPhoneEmailCandidates(digits: string): string[] {
  const alternateDigits = digits.startsWith("0") ? digits.slice(1) : `0${digits}`;
  return [`${digits}@wt-shuttle.app`, `${alternateDigits}@wt-shuttle.app`];
}

async function signInWithTimeout(credentials: { email: string; password: string }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.auth.signInWithPassword(credentials),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("sign_in_timeout")), SIGN_IN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Self-signup is intentionally removed: accounts are only ever issued
// by an admin (bulk import or manual credential reset). If someone
// still needs to sign up directly via the Supabase API despite this,
// disable "Allow new users to sign up" in the Supabase dashboard under
// Authentication → Settings — that's the actual enforcement; this page
// just no longer offers the option.
function AuthPage() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isSupervisor, loading } = useAuth();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (loading || !user) return;
    if (!isAdmin && !isSupervisor && profile?.must_change_password) {
      void navigate({ to: "/change-password" });
      return;
    }
    if (isAdmin) void navigate({ to: "/admin" });
    else if (isSupervisor) void navigate({ to: "/supervisor/students" });
    else void navigate({ to: "/dashboard" });
  }, [loading, user, profile, isAdmin, isSupervisor, navigate]);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // A student logs in with their phone number, which isn't a real
      // email address — Supabase Auth requires one, so it's stored as
      // {digits}@wt-shuttle.app under the hood. Staff accounts still
      // use a real email and pass straight through unchanged.
      const trimmed = email.trim();
      let result: Awaited<ReturnType<typeof signInWithTimeout>>;
      if (trimmed.includes("@")) {
        result = await signInWithTimeout({ email: trimmed, password });
      } else {
        const digits = normalizePhoneDigits(trimmed);
        const [primaryEmail, alternateEmail] = buildPhoneEmailCandidates(digits);
        result = await signInWithTimeout({ email: primaryEmail!, password });
        if (result.error?.code === "invalid_credentials") {
          result = await signInWithTimeout({ email: alternateEmail!, password });
        }
      }

      const { error } = result;
      if (error) {
        if (error.code === "invalid_credentials") {
          toast.error(t("auth.invalidCredentials"));
        } else if (error.code === "over_request_rate_limit" || error.status === 429) {
          toast.error(t("auth.rateLimited"));
        } else {
          toast.error(t("auth.connectionError"));
        }
        return;
      }
      toast.success(t("auth.welcomeBack"));
      // Redirect is handled by the effect above once roles finish loading.
    } catch {
      // Timeout (our own race) or a thrown network error (fetch
      // failed, TypeError, AbortError) — never the raw message, which
      // means nothing to a student on a flaky connection.
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
          <h1 className="mt-4 text-2xl font-bold">Waleed &amp; Talaat</h1>
          <p className="text-sm text-muted-foreground">Student & supervisor access</p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <Field
            label={t("auth.phoneOrEmail")}
            value={email}
            onChange={setEmail}
            type="text"
            disabled={busy}
          />
          <Field
            label={t("auth.password")}
            value={password}
            onChange={setPassword}
            type="password"
            disabled={busy}
          />
          <Button type="submit" className="btn-gold w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("auth.signIn")}
          </Button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
