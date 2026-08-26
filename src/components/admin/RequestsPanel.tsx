import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prettyDate } from "@/lib/schedule";

type Request = {
  id: string;
  full_name: string;
  phone: string;
  route: string;
  slot: string;
  service_date: string;
  status: string;
};

export function RequestsPanel() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("daily_pass_requests")
      .select("id,full_name,phone,route,slot,service_date,status")
      .order("created_at", { ascending: false });
    setRequests((data as Request[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, action: "approved" | "rejected") => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("admin-daily-pass-action", {
      body: { request_id: id, action },
    });
    setBusyId(null);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Could not update request");
      return;
    }
    void load();
    if (data.whatsapp_url) {
      // Opens WhatsApp Web/App with the chat and message pre-filled —
      // the admin reviews it and presses Send themselves.
      window.open(data.whatsapp_url, "_blank", "noopener,noreferrer");
    }
    toast.success(
      action === "approved"
        ? "Approved — WhatsApp opened with the pass link, ready to send"
        : "Rejected — WhatsApp opened with the notice, ready to send",
    );
  };

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Pending requests</h2>
          <Badge className="btn-gold">{pending.length}</Badge>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No pending daily pass requests.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
              >
                <div className="flex-1">
                  <p className="font-semibold">{r.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.phone} · {r.route} · {r.slot} · {prettyDate(r.service_date)}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="btn-gold"
                  disabled={busyId === r.id}
                  onClick={() => void decide(r.id, "approved")}
                >
                  <Check className="size-4" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => void decide(r.id, "rejected")}
                >
                  <X className="size-4" /> Reject
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-semibold">Recently decided</h2>
          <div className="mt-4 space-y-2">
            {decided.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-2.5 text-sm"
              >
                <span>
                  {r.full_name} · {r.route} · {r.slot}
                </span>
                <Badge
                  className={
                    r.status === "approved"
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
