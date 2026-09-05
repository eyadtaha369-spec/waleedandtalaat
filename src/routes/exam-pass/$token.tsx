import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { examDateLabel } from "@/lib/examBooking";

export const Route = createFileRoute("/exam-pass/$token")({
  head: () => ({
    meta: [
      { title: "تصريح ركوب الامتحان — Waleed & Talaat" },
      { name: "description", content: "تصريح الركوب الخاص بأتوبيس الامتحان." },
    ],
  }),
  component: ExamPassPage,
});

type ExamPass = {
  full_name: string;
  exam_date: string;
  pickup_stop: string;
  pickup_time: string;
  status: string;
  has_companion: boolean;
  companion_name: string | null;
};

function ExamPassPage() {
  const { token } = Route.useParams();
  const [pass, setPass] = useState<ExamPass | null | undefined>(undefined);

  useEffect(() => {
    void supabase
      .rpc("get_exam_pass", { p_token: token })
      .then(({ data }) => setPass((data as ExamPass[])?.[0] ?? null));
  }, [token]);

  if (pass === undefined) {
    return <main className="mx-auto max-w-lg px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  if (pass === null) {
    return (
      <main className="surface-navy flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="shadow-luxe w-full max-w-md rounded-3xl bg-card p-8 text-center text-card-foreground">
          <Hourglass className="text-accent mx-auto size-10" />
          <h1 className="mt-4 text-xl font-bold">لم يتم العثور على التصريح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذا الرابط غير صالح أو منتهي الصلاحية. برجاء التواصل معنا على الواتساب.
          </p>
        </div>
      </main>
    );
  }

  const payload = JSON.stringify({ v: 1, id: token, exam: true });

  return (
    <main className="surface-navy min-h-[calc(100vh-64px)] px-4 py-10" dir="rtl">
      <div className="shadow-luxe mx-auto max-w-md overflow-hidden rounded-3xl bg-card text-card-foreground">
        <div className="surface-navy flex items-center gap-3 p-5">
          <Logo size={44} />
          <div>
            <p className="font-display font-semibold">وليد وطلعت</p>
            <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">تصريح ركوب امتحان</p>
          </div>
          <Badge className="btn-gold ms-auto">{examDateLabel(pass.exam_date)}</Badge>
        </div>

        <div className="p-6">
          <h1 className="text-xl font-bold">{pass.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {pass.pickup_stop} · {pass.pickup_time}
          </p>
          <Badge
            className={`mt-3 ${pass.has_companion ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {pass.has_companion
              ? `👥 طالب + 1 مرافق (مدفوع)${pass.companion_name ? ` — ${pass.companion_name}` : ""}`
              : "👤 طالب فقط"}
          </Badge>
        </div>

        <div className="flex justify-center border-y border-dashed border-border bg-secondary/60 p-6">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={payload} size={196} level="M" />
          </div>
        </div>

        <div className="p-6 text-center text-sm text-muted-foreground">
          العودة بعد انتهاء الامتحان (سيتم تحديد الميعاد لاحقاً)
        </div>
      </div>
    </main>
  );
}
