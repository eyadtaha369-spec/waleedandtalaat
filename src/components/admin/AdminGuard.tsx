import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps an admin-section page. Redirects: signed-out -> /auth,
 * students -> /dashboard, and (when requireAdmin) supervisors ->
 * /admin/scan, their only allowed page. Renders nothing until the
 * check passes, so pages never flash unauthorized content.
 */
export function AdminGuard({
  requireAdmin = false,
  children,
}: {
  requireAdmin?: boolean;
  children: React.ReactNode;
}) {
  const { user, isStaff, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (!isStaff) {
      toast.error("Staff access required.");
      void navigate({ to: "/dashboard" });
      return;
    }
    if (requireAdmin && !isAdmin) {
      toast.error("Admin access required.");
      void navigate({ to: "/admin/scan" });
    }
  }, [loading, user, isStaff, isAdmin, requireAdmin, navigate]);

  const authorized = !loading && !!user && isStaff && (!requireAdmin || isAdmin);
  if (!authorized) {
    return <main className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Loading…</main>;
  }
  return <>{children}</>;
}
