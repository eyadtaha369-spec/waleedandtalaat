import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { usePushReminders } from "@/hooks/usePushReminders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";

// Never prompt on the sign-in page, the public trip-booking/trip-pass
// pages, or the scanner — isStaff already keeps staff off the scanner,
// but this is a direct belt-and-suspenders route check too.
const HIDDEN_EXACT = new Set(["/auth", "/admin/scan"]);
const HIDDEN_PREFIXES = ["/trips/", "/trip-pass/"];

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_EXACT.has(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
}

export function PushPermissionModal() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { variant, showDeniedBanner, iosStandalone, closeModal, dismissBanner, requestPermission } =
    usePushReminders();
  const [busy, setBusy] = useState(false);

  const showModal = !!user && !isHiddenRoute(pathname) && variant !== null;
  const showBanner = !!user && pathname === "/dashboard" && showDeniedBanner;

  const handleEnable = async () => {
    setBusy(true);
    const result = await requestPermission();
    setBusy(false);
    if (result.status === "granted") {
      toast.success(t("push.enabledToast"));
    } else if (result.status === "error") {
      toast.error(result.message || t("push.genericError"));
    }
    // "denied" closes the modal and the banner takes over on the
    // dashboard; "dismissed" just closes this page view's modal —
    // both are already handled inside requestPermission() itself.
  };

  return (
    <>
      {showModal && variant && (
        <Dialog open={showModal} onOpenChange={(v) => !v && closeModal()}>
          <DialogContent className="surface-navy border-gilded text-white">
            <div className="btn-gold mx-auto flex size-16 items-center justify-center rounded-full">
              <Bell className="size-8" />
            </div>
            <DialogTitle className="text-center text-lg">{t("push.modalTitle")}</DialogTitle>
            <p className="text-center text-sm opacity-90">
              {variant === "ios-install" ? t("push.iosBody") : t("push.body")}
            </p>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {variant === "ios-install" ? (
                <Button className="btn-gold w-full" onClick={closeModal}>
                  {t("push.iosOk")}
                </Button>
              ) : (
                <>
                  <Button
                    className="btn-gold w-full"
                    disabled={busy}
                    onClick={() => void handleEnable()}
                  >
                    {t("push.enableNow")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-white/30 bg-transparent text-white hover:bg-white/10"
                    onClick={closeModal}
                  >
                    {t("push.later")}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {showBanner && (
        <div className="fixed inset-x-0 top-16 z-30 flex items-center justify-between gap-3 border-b border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
          <span>{iosStandalone ? t("push.deniedBannerIos") : t("push.deniedBanner")}</span>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label={t("common.close")}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
