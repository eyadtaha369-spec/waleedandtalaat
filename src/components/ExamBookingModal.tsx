import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXAM_DATES,
  EXAM_STOPS,
  EXAM_RETURN_NOTE,
  COMPANION_RELATIONS,
  COMPANION_PAYMENT_NOTICE,
  DUPLICATE_BOOKING_MESSAGE,
} from "@/lib/examBooking";

type CompanionChoice = "no" | "yes";

export function ExamBookingModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [examDate, setExamDate] = useState<string>(EXAM_DATES[0].value);
  const [stopIndex, setStopIndex] = useState(0);
  const [companionChoice, setCompanionChoice] = useState<CompanionChoice | null>(null);
  const [companionName, setCompanionName] = useState("");
  const [companionRelation, setCompanionRelation] = useState<string>(COMPANION_RELATIONS[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setFullName("");
    setPhone("");
    setExamDate(EXAM_DATES[0].value);
    setStopIndex(0);
    setCompanionChoice(null);
    setCompanionName("");
    setCompanionRelation(COMPANION_RELATIONS[0]);
    setReceiptFile(null);
    setSent(false);
  };

  const submit = async () => {
    if (!fullName.trim() || fullName.trim().length < 3) {
      toast.error("اكتب اسم الطالب بالكامل");
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) {
      toast.error("اكتب رقم واتساب صحيح");
      return;
    }
    if (!companionChoice) {
      toast.error("برجاء اختيار هل يوجد مرافق أم لا");
      return;
    }
    const hasCompanion = companionChoice === "yes";
    if (hasCompanion) {
      if (!companionName.trim()) {
        toast.error("اكتب اسم المرافق");
        return;
      }
      if (!receiptFile) {
        toast.error("برجاء إرفاق صورة إيصال التحويل");
        return;
      }
    }

    setBusy(true);

    const { data: isDuplicate, error: dupError } = await supabase.rpc("check_exam_duplicate", {
      p_phone: phone.trim(),
      p_exam_date: examDate,
    });
    if (dupError) {
      setBusy(false);
      toast.error(dupError.message);
      return;
    }
    if (isDuplicate) {
      setBusy(false);
      toast.error(DUPLICATE_BOOKING_MESSAGE);
      return;
    }

    let receiptPath: string | null = null;
    if (hasCompanion && receiptFile) {
      const ext = receiptFile.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("exam-receipts")
        .upload(path, receiptFile);
      if (uploadError) {
        setBusy(false);
        toast.error(uploadError.message);
        return;
      }
      receiptPath = path;
    }

    const stop = EXAM_STOPS[stopIndex]!;
    const { error } = await supabase.from("exam_bookings").insert({
      full_name: fullName.trim(),
      phone: phone.trim(),
      exam_date: examDate,
      pickup_stop: stop.name,
      pickup_time: stop.time,
      has_companion: hasCompanion,
      companion_name: hasCompanion ? companionName.trim() : null,
      companion_relation: hasCompanion ? companionRelation : null,
      receipt_url: receiptPath,
    });
    setBusy(false);
    if (error?.code === "23505") {
      toast.error(DUPLICATE_BOOKING_MESSAGE);
      return;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        {sent ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="text-success mx-auto size-10" />
            <h2 className="mt-4 text-lg font-bold">تم إرسال طلبك بنجاح! ⏳</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              طلبك الآن قيد المراجعة، وسيتم التواصل معك على الواتساب فور تأكيد الحجز.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>حجز أيام الامتحانات 📝</DialogTitle>
              <DialogDescription>
                خاص بالطلاب غير المشتركين — احجز مقعدك ليوم الامتحان بدون حساب أو كلمة مرور.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>اسم الطالب</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف / الواتساب</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الامتحان</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                >
                  {EXAM_DATES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>محطة الركوب صباحاً</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={stopIndex}
                  onChange={(e) => setStopIndex(Number(e.target.value))}
                >
                  {EXAM_STOPS.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.time})
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">ميعاد العودة: </span>
                {EXAM_RETURN_NOTE}
              </div>

              <div className="space-y-2">
                <Label>هل يوجد مرافق (ولي أمر)؟ *</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCompanionChoice("no")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      companionChoice === "no"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    لا (طالب فقط)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompanionChoice("yes")}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      companionChoice === "yes"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    نعم (يوجد مرافق - 250 جنيه)
                  </button>
                </div>
              </div>

              {companionChoice === "yes" && (
                <div className="space-y-4 rounded-xl border border-border p-3">
                  <div className="space-y-2">
                    <Label>اسم المرافق</Label>
                    <Input
                      value={companionName}
                      onChange={(e) => setCompanionName(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>صلة القرابة</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={companionRelation}
                      onChange={(e) => setCompanionRelation(e.target.value)}
                    >
                      {COMPANION_RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>صورة إيصال التحويل</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="whitespace-pre-line rounded-lg border-2 border-warning bg-warning/20 p-3 text-sm font-medium text-foreground">
                    {COMPANION_PAYMENT_NOTICE}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button className="btn-gold w-full" disabled={busy} onClick={() => void submit()}>
                تأكيد الطلب 🚀
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
