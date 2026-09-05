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
import { EXAM_DATES, EXAM_STOPS, EXAM_RETURN_NOTE } from "@/lib/examBooking";

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
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setFullName("");
    setPhone("");
    setExamDate(EXAM_DATES[0].value);
    setStopIndex(0);
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
    const stop = EXAM_STOPS[stopIndex]!;
    setBusy(true);
    const { error } = await supabase.from("exam_bookings").insert({
      full_name: fullName.trim(),
      phone: phone.trim(),
      exam_date: examDate,
      pickup_stop: stop.name,
      pickup_time: stop.time,
    });
    setBusy(false);
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
      <DialogContent dir="rtl">
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
