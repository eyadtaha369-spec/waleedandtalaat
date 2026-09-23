import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useRoutes } from "@/hooks/useRoutes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentMethod = "cash" | "instapay";

export function CollectionsPanel() {
  const { t } = useLanguage();
  const { profile, isAdmin } = useAuth();
  const { routes } = useRoutes();
  const [studentName, setStudentName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [route, setRoute] = useState(profile?.assigned_route ?? routes[0] ?? "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

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
          </div>
        )}
        <Button className="btn-gold w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "…" : t("collections.submit")}
        </Button>
      </div>
    </section>
  );
}
