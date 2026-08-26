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

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    const { error } = await supabase.from("daily_pass_requests").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "approved" ? "Request approved" : "Request rejected");
    void load();
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
