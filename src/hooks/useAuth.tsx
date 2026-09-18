import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  username: string | null;
  phone: string | null;
  route: string | null;
  pickup_stop: string | null;
  subscription_type: string;
  payment_status: string;
  trips_total: number;
  trips_remaining: number;
  photo_url: string | null;
  assigned_route: string | null;
  must_change_password: boolean;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  isStaff: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  // sessionResolved: has the very first getSession() call finished.
  // profileLoading: is a profile/roles fetch currently in flight — set
  // on EVERY auth state change, not just the initial one. Consumers
  // need loading to stay true until BOTH are settled, or a redirect
  // decision gets made on stale pre-sign-in profile/roles data (null/
  // empty) and then corrects itself a moment later once the real
  // profile arrives — which is exactly what was happening here: /auth
  // and /dashboard's guards would fire on that stale null profile
  // (isAdmin/isSupervisor wrongly false, must_change_password wrongly
  // undefined), navigate somewhere, then re-fire once the real
  // profile loaded and navigate again — a visible bounce.
  const [sessionResolved, setSessionResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const load = async (uid: string | undefined) => {
    setProfileLoading(true);
    if (!uid) {
      setProfile(null);
      setRoles([]);
      setProfileLoading(false);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((p as Profile) ?? null);
    setRoles((r ?? []).map((x: { role: string }) => x.role));
    setProfileLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setTimeout(() => void load(s?.user?.id), 0);
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session?.user?.id);
      setSessionResolved(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    profile,
    roles,
    isStaff: roles.includes("admin") || roles.includes("supervisor"),
    isAdmin: roles.includes("admin"),
    isSupervisor: roles.includes("supervisor"),
    loading: !sessionResolved || profileLoading,
    refresh: async () => load(session?.user?.id),
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRoles([]);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
