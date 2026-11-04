import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  enablePush,
  isIosInstallPromptEligible,
  isIosStandaloneApp,
  isPreviewOrDevEnvironment,
  isPushSupported,
  refreshPushSubscription,
  type EnablePushResult,
} from "@/lib/push";

// An earlier version of this feature snoozed the modal for 24h via
// localStorage. That's gone now — every page view re-evaluates from
// scratch — but an existing visitor's browser may still have the old
// key sitting around, so clear it once on mount.
const LEGACY_SNOOZE_KEY = "push_reminder_snoozed_until";

export type PushModalVariant = "enable" | "ios-install";

export function usePushReminders(): {
  variant: PushModalVariant | null;
  showDeniedBanner: boolean;
  iosStandalone: boolean;
  closeModal: () => void;
  dismissBanner: () => void;
  requestPermission: () => Promise<EnablePushResult>;
} {
  const { user, isStaff, loading } = useAuth();

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_SNOOZE_KEY);
    } catch {
      // No storage access — nothing to clean up.
    }
  }, []);

  const available = !isPreviewOrDevEnvironment();
  const supported = available && isPushSupported();
  const iosInstallEligible = available && isIosInstallPromptEligible();

  // Read live, never cached — re-checked whenever this tab becomes
  // visible again, so a permission change made in the browser's own
  // settings while the tab was open is picked up without a refresh.
  const [permission, setPermission] = useState<NotificationPermission | null>(() =>
    supported ? Notification.permission : null,
  );

  useEffect(() => {
    if (!supported) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") setPermission(Notification.permission);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [supported]);

  // In-memory only, scoped to this page view — never persisted, so a
  // refresh or a fresh visit always starts over.
  const [modalClosed, setModalClosed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Keep an already-granted subscription alive and re-linked to whoever
  // is signed in right now — no modal, no prompt.
  useEffect(() => {
    if (loading || !user || isStaff) return;
    if (!supported || permission !== "granted") return;
    void refreshPushSubscription();
  }, [loading, user, isStaff, supported, permission]);

  const eligible = !loading && !!user && !isStaff;

  let variant: PushModalVariant | null = null;
  if (eligible && !modalClosed) {
    if (iosInstallEligible) variant = "ios-install";
    else if (supported && permission === "default") variant = "enable";
  }

  const showDeniedBanner = eligible && supported && permission === "denied" && !bannerDismissed;

  const closeModal = useCallback(() => setModalClosed(true), []);
  const dismissBanner = useCallback(() => setBannerDismissed(true), []);

  const requestPermission = useCallback(async (): Promise<EnablePushResult> => {
    const result = await enablePush();
    setPermission(supported ? Notification.permission : null);
    // Covers every outcome, including "dismissed" (permission stays
    // "default", so only this page view's modal closes — it comes
    // back next visit, per spec).
    setModalClosed(true);
    return result;
  }, [supported]);

  return {
    variant,
    showDeniedBanner,
    iosStandalone: available && isIosStandaloneApp(),
    closeModal,
    dismissBanner,
    requestPermission,
  };
}
