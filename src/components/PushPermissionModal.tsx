import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell } from "lucide-react";
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
  const { variant, requestPermission, snooze } = usePushReminders();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shouldShow = !!user && !isHiddenRoute(pathname) && variant !== null;

  useEffect(() => {
    setOpen(shouldShow);
  }, [shouldShow]);

  if (!open || !variant) return null;

  const handleSnooze = () => {
    snooze();
    setOpen(false);
  };

  const handleEnable = async () => {
    setBusy(true);
    const result = await requestPermission();
    setBusy(false);
    switch (result.status) {
      case "granted":
        toast.success(t("push.enabledToast"));
        setOpen(false);
        return;
      case "denied":
        toast.info(t("push.deniedHelp"));
        setOpen(false);
        return;
      case "error":
        toast.error(result.message || t("push.genericError"));
        return;
      case "dismissed":
      case "unsupported":
        // The user closed the native prompt without choosing, or support
        // was lost between render and click — leave the modal as-is.
        return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSnooze()}>
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
            <Button className="btn-gold w-full" onClick={handleSnooze}>
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
                onClick={handleSnooze}
              >
                {t("push.later")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
