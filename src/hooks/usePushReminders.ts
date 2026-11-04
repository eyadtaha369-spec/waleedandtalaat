import { useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  enablePush,
  isIosInstallPromptEligible,
  isPreviewOrDevEnvironment,
  isPushSupported,
  refreshPushSubscription,
  type EnablePushResult,
} from "@/lib/push";

const SNOOZE_KEY = "push_reminder_snoozed_until";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function isSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    return !!raw && Number(raw) > Date.now();
  } catch {
    // Storage unavailable — behave as if never snoozed.
    return false;
  }
}

function snoozeFor24h(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // No persistence available; the modal will just show again next visit.
  }
}

export type PushModalVariant = "enable" | "ios-install";

/**
 * Decides whether the student should see the push-permission modal right
 * now, and drives the quiet background re-subscribe for students who
 * already granted permission earlier.
 */
export function usePushReminders(): {
  variant: PushModalVariant | null;
  requestPermission: () => Promise<EnablePushResult>;
  snooze: () => void;
} {
  const { user, isStaff, loading } = useAuth();

  const available = !isPreviewOrDevEnvironment();
  const supported = available && isPushSupported();
  const iosInstallEligible = available && isIosInstallPromptEligible();

  // Keep an already-granted subscription alive and re-linked to whoever
  // is currently signed in — no modal, no prompt.
  useEffect(() => {
    if (loading || !user || isStaff) return;
    if (!supported || Notification.permission !== "granted") return;
    void refreshPushSubscription();
  }, [loading, user, isStaff, supported]);

  const eligible = !loading && !!user && !isStaff && !isSnoozed();

  let variant: PushModalVariant | null = null;
  if (eligible) {
    if (iosInstallEligible) variant = "ios-install";
    else if (supported && Notification.permission === "default") variant = "enable";
  }

  const requestPermission = useCallback(() => enablePush(), []);
  const snooze = useCallback(() => snoozeFor24h(), []);

  return { variant, requestPermission, snooze };
}
