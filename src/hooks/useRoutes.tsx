import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RoutesData = {
  routes: string[];
  stopsByRoute: Record<string, string[]>;
  loading: boolean;
};

/**
 * Loads the real route/stop hierarchy from the database (public read,
 * no auth required — the guest daily-pass form needs it too). Shaped
 * like the old hardcoded constants so call sites barely change.
 */
export function useRoutes(): RoutesData {
  const [routes, setRoutes] = useState<string[]>([]);
  const [stopsByRoute, setStopsByRoute] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data: routeRows } = await supabase
        .from("routes")
        .select("id,name")
        .order("display_order");
      const { data: stopRows } = await supabase
        .from("stops")
        .select("route_id,name")
        .order("display_order");

      const routeNameById = new Map((routeRows ?? []).map((r) => [r.id, r.name]));
      const grouped: Record<string, string[]> = {};
      for (const r of routeRows ?? []) grouped[r.name] = [];
      for (const s of stopRows ?? []) {
        const routeName = routeNameById.get(s.route_id);
        if (routeName) grouped[routeName]?.push(s.name);
      }

      setRoutes((routeRows ?? []).map((r) => r.name));
      setStopsByRoute(grouped);
      setLoading(false);
    })();
  }, []);

  return { routes, stopsByRoute, loading };
}
