import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Wraps an admin-section page. Redirects: signed-out -> /auth,
 * students -> /dashboard, and (when requireAdmin) supervisors ->
 * /supervisor/students, their default landing page.
 */
export function AdminGuard({
  requireAdmin = false,
  children,
}: {
  requireAdmin?: boolean;
  children: React.ReactNode;
}) {
  const { user, isStaff, isAdmin, loading } = useAuth();
  const { t } = useLanguage();
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
      void navigate({ to: "/supervisor/students" });
    }
  }, [loading, user, isStaff, isAdmin, requireAdmin, navigate]);

  const authorized = !loading && !!user && isStaff && (!requireAdmin || isAdmin);
  if (!authorized) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }
  return <>{children}</>;
}
