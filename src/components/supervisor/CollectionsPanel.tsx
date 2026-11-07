import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { useSessionState } from "@/hooks/usePersistentState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentMethod = "cash" | "instapay";

export function CollectionsPanel() {
  const { t } = useLanguage();
  const { profile, isAdmin } = useAuth();
  const { routes } = useRoutes();
  // Plain form fields survive a tab discard via sessionStorage — but
  // receiptFile can't be (a File object isn't serialisable), so a
  // restored form may need the receipt reattached; see the hint below.
  const [studentName, setStudentName] = useSessionState<string>("collections.studentName", "", {
    validate: (v): v is string => typeof v === "string",
  });
  const [amount, setAmount] = useSessionState<string>("collections.amount", "", {
    validate: (v): v is string => typeof v === "string",
  });
  const [paymentMethod, setPaymentMethod] = useSessionState<PaymentMethod>(
    "collections.paymentMethod",
    "cash",
    { validate: (v): v is PaymentMethod => v === "cash" || v === "instapay" },
  );
  const [route, setRoute] = useSessionState<string>(
    "collections.route",
    profile?.assigned_route ?? routes[0] ?? "",
    { validate: (v): v is string => typeof v === "string" },
  );
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // A restored instapay submission needs its receipt reattached — the
  // file itself can never survive a tab discard.
  const needsReceiptReattach = paymentMethod === "instapay" && !receiptFile && !!studentName;

  const submit = async () => {
    if (!studentName.trim()) {
      toast.error(t("collections.nameRequired"));
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error(t("collections.amountRequired"));
      return;
    }
    if (!route) {
      toast.error(t("collections.routeRequired"));
      return;
    }
    if (paymentMethod === "instapay" && !receiptFile) {
      toast.error(t("collections.receiptRequired"));
      return;
    }

    setBusy(true);
    let receiptPath: string | null = null;
    if (paymentMethod === "instapay" && receiptFile) {
      const ext = receiptFile.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("collection-receipts")
        .upload(path, receiptFile);
      if (uploadError) {
        setBusy(false);
        toast.error(uploadError.message);
        return;
      }
      receiptPath = path;
    }

    const { data, error } = await supabase.rpc("log_collection", {
      p_student_name: studentName.trim(),
      p_amount: amountNum,
      p_payment_method: paymentMethod,
      p_route: route,
      p_receipt_url: receiptPath,
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error(
        (data as { error?: string })?.error ?? error?.message ?? t("collections.logFailed"),
      );
      return;
    }
    toast.success(t("collections.logged"));
    setStudentName("");
    setAmount("");
    setReceiptFile(null);
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="font-semibold">{t("collections.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("collections.subtitle")}</p>
      <div className="mt-4 max-w-md space-y-4">
        <div className="space-y-2">
          <Label>{t("collections.studentName")}</Label>
          <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("collections.amount")}</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="space-y-2">
            <Label>{t("common.route")}</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
            >
              {routes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("dailyPass.paymentMethod")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`rounded-md border px-3 py-2 text-sm ${
                paymentMethod === "cash"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-input bg-background"
              }`}
            >
              {t("dailyPass.cash")}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("instapay")}
              className={`rounded-md border px-3 py-2 text-sm ${
                paymentMethod === "instapay"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-input bg-background"
              }`}
            >
              {t("dailyPass.instapay")}
            </button>
          </div>
        </div>
        {paymentMethod === "instapay" && (
          <div className="space-y-2">
            <Label>{t("dailyPass.receiptUpload")}</Label>
            <Input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
            {needsReceiptReattach && (
              <p className="text-xs text-warning-foreground">
                {t("collections.reattachReceiptHint")}
              </p>
            )}
          </div>
        )}
        <Button className="btn-gold w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "…" : t("collections.submit")}
        </Button>
      </div>
    </section>
  );
}
