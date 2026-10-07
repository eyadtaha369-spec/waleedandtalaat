import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cairoNow, toDateKey } from "@/lib/schedule";
import { formatSlotLabel } from "@/lib/i18n/dateFormat";
import { useLanguage } from "@/hooks/useLanguage";

type SearchRow = {
  student_name: string;
  phone: string | null;
  route: string | null;
  pickup_stop: string | null;
  slot: string | null;
  kind: "morning" | "return";
  status: "confirmed" | "checked_in" | "opted_out";
  source: "student" | "daily_pass";
  service_date: string;
};

type StudentGroup = {
  key: string;
  student_name: string;
  phone: string | null;
  legs: SearchRow[];
};

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 100;

export function ManifestSearch() {
  const { t, lang } = useLanguage();
  const todayKey = useMemo(() => toDateKey(cairoNow()), []);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<string>(todayKey);
  const [results, setResults] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  const isQueryTooShort = trimmedQuery.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (isQueryTooShort) {
      requestIdRef.current += 1;
      setResults([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    const handle = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.rpc("search_manifest_students", {
          p_query: trimmedQuery,
          p_date: date || null,
        });
        // A faster request may have started after this one — ignore a
        // stale response so quick typing can't flash old results.
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setHasSearched(true);
        if (error) {
          toast.error(t("manifestSearch.searchError"));
          setResults([]);
          return;
        }
        setResults((data as SearchRow[]) ?? []);
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, date]);

  const groups = useMemo<StudentGroup[]>(() => {
    const map = new Map<string, StudentGroup>();
    for (const r of results) {
      const key = `${r.student_name}__${r.phone ?? ""}`;
      if (!map.has(key)) {
        map.set(key, { key, student_name: r.student_name, phone: r.phone, legs: [] });
      }
      map.get(key)!.legs.push(r);
    }
    return [...map.values()];
  }, [results]);

  const statusBadge = (status: SearchRow["status"]) => {
    if (status === "checked_in") {
      return (
        <Badge className="bg-success text-success-foreground">
          {t("manifestSearch.statusCheckedIn")}
        </Badge>
      );
    }
    if (status === "opted_out") {
      return (
        <Badge className="bg-warning text-warning-foreground">
          {t("manifestSearch.statusOptedOut")}
        </Badge>
      );
    }
    return (
      <Badge className="bg-muted text-muted-foreground">
        {t("manifestSearch.statusConfirmed")}
      </Badge>
    );
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("manifestSearch.placeholder")}
            className="ps-9 pe-9"
          />
          {loading && (
            <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <input
          type="date"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {date !== todayKey && (
          <button
            type="button"
            className="text-xs text-accent underline underline-offset-2"
            onClick={() => setDate(todayKey)}
          >
            {t("manifests.resetToday")} ({todayKey})
          </button>
        )}
      </div>

      {!isQueryTooShort && hasSearched && !loading && (
        <div className="mt-4">
          {groups.length === 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">
                {date === todayKey
                  ? t("manifestSearch.noResultsToday")
                  : `${t("manifestSearch.noResultsOnDate")} ${date}`}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("manifestSearch.walkInFootnote")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.length === MAX_RESULTS && (
                <p className="text-xs text-warning-foreground">{t("manifestSearch.cappedHint")}</p>
              )}
              {groups.map((group) => (
                <div key={group.key} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{group.student_name}</p>
                    <span className="text-xs text-muted-foreground">{group.phone ?? "—"}</span>
                  </div>

                  {/* Mobile: stacked cards. md+: table. */}
                  <div className="mt-3 space-y-2 md:hidden">
                    {group.legs.map((leg, i) => (
                      <div key={i} className="rounded-xl border border-border/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{leg.route ?? "—"}</span>
                          {leg.source === "daily_pass" && (
                            <Badge className="bg-orange-500 text-white">
                              {t("manifestSearch.dailyPassBadge")}
                            </Badge>
                          )}
                          <span className="ms-auto">{statusBadge(leg.status)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {leg.pickup_stop ?? "—"} ·{" "}
                          {leg.slot ? formatSlotLabel(leg.slot, lang) : "—"} ·{" "}
                          {leg.kind === "morning"
                            ? t("manifestSearch.kindMorning")
                            : t("manifestSearch.kindReturn")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("common.route")}</TableHead>
                          <TableHead>{t("manifestSearch.assignedStop")}</TableHead>
                          <TableHead>{t("manifests.timeSlot")}</TableHead>
                          <TableHead>{t("manifestSearch.legColumn")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.legs.map((leg, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {leg.route ?? "—"}
                                {leg.source === "daily_pass" && (
                                  <Badge className="bg-orange-500 text-white">
                                    {t("manifestSearch.dailyPassBadge")}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{leg.pickup_stop ?? "—"}</TableCell>
                            <TableCell>
                              {leg.slot ? formatSlotLabel(leg.slot, lang) : "—"}
                            </TableCell>
                            <TableCell>
                              {leg.kind === "morning"
                                ? t("manifestSearch.kindMorning")
                                : t("manifestSearch.kindReturn")}
                            </TableCell>
                            <TableCell>{statusBadge(leg.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
