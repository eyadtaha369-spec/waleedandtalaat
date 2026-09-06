import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PackageStudent = {
  user_id: string;
  full_name: string;
  phone: string | null;
  route: string | null;
  trips_remaining: number;
  trips_total: number;
};

export function TripBalancesPanel() {
  const { t } = useLanguage();
  const [students, setStudents] = useState<PackageStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_package_students");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudents((data as PackageStudent[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (s: PackageStudent) => {
    setEditingId(s.user_id);
    setEditValue(String(s.trips_remaining));
  };

  const save = async (studentId: string) => {
    const n = Number(editValue);
    if (!Number.isInteger(n) || n < 0) {
      toast.error(t("tripBalances.enterWholeNumber"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("reset_student_trips", {
      p_student_id: studentId,
      p_remaining_trips: n,
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error(
        (data as { error?: string })?.error ?? error?.message ?? t("tripBalances.updateError"),
      );
      return;
    }
    toast.success(t("tripBalances.updated"));
    setEditingId(null);
    void load();
  };

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone ?? "").includes(q);
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("tripBalances.title")}</h2>
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => void load()}>
          <RefreshCw className="size-4" /> {t("tripBalances.refresh")}
        </Button>
      </div>
      <Input
        placeholder={t("tripBalances.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-3 max-w-xs"
      />

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("tripBalances.noMatch")}</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.route")}</TableHead>
              <TableHead>{t("tripBalances.remainingTrips")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.user_id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell className="whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                <TableCell>{s.route ?? "—"}</TableCell>
                <TableCell>
                  {editingId === s.user_id ? (
                    <Input
                      type="number"
                      min={0}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8 w-24"
                    />
                  ) : (
                    `${s.trips_remaining}/${s.trips_total}`
                  )}
                </TableCell>
                <TableCell className="text-end">
                  {editingId === s.user_id ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        className="btn-gold"
                        disabled={busy}
                        onClick={() => void save(s.user_id)}
                      >
                        <Save className="size-4" /> {t("common.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                      <Pencil className="size-4" /> {t("tripBalances.editRemaining")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
