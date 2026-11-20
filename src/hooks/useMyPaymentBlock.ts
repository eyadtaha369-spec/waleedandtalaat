import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Advisory only — the server enforces the real block (the bookings
 * trigger and scan_pass's own check), so any error here resolves to
 * `false` rather than blocking a student on a flaky read.
 */
export function useMyPaymentBlock() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setBlocked(false);
      return;
    }
    const { data, error } = await supabase
      .from("payment_blocks")
      .select("is_blocked")
      .eq("student_id", user.id)
      .maybeSingle();
    setBlocked(!error && data?.is_blocked === true);
  }, [user]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void loadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => void loadRef.current(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  return blocked;
}
