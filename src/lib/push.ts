import { supabase } from "@/integrations/supabase/client";

// Safe to ship client-side — it only identifies which private key the
// server must sign pushes with, it isn't a secret itself.
export const VAPID_PUBLIC_KEY =
  "BBeBO2wZAYCBVmQeyNY3GzZiSo6KaZZ4tc4B7A3qSfJ34FiLjK1lju6kvr7EQLHLwuwkFaRb5cV6IgROIjrYAOs";

export type EnablePushResult =
  | { status: "granted" }
  | { status: "denied" }
  | { status: "dismissed" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

export function isPushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * True on iOS Safari before it's been added to the Home Screen — there,
 * PushManager simply doesn't exist, so isPushSupported() is false, but
 * the fix is "add to Home Screen" rather than "unsupported device."
 */
export function isIosInstallPromptEligible(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !isStandalone && !("PushManager" in window);
}

/**
 * True once that same iOS Home-Screen install has actually been opened
 * as a standalone app — used only to pick the right wording for the
 * "notifications are blocked" banner (iOS Settings app vs. a desktop/
 * Android browser's own site-settings lock icon), since a standalone
 * PWA has no URL bar to point at.
 */
export function isIosStandaloneApp(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Mirrors the preview-zone detection in previewAuthStorage.ts (without
// importing it — that file is generated and reserved for auth storage).
// Registering a service worker and prompting for push on a Lovable
// preview surface, or during local dev, would be pointless noise and
// could leave a stray subscription pointed at a throwaway origin.
export function isPreviewOrDevEnvironment(): boolean {
  if (typeof window === "undefined") return true;
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  const PREVIEW_ZONES = [
    "lovableproject.com",
    "lovableproject-dev.com",
    "lovable.app",
    "gpt-eng.com",
    "gptengineer.run",
  ];
  return PREVIEW_ZONES.some((z) => host === z || host.endsWith(`.${z}`));
}

function canRegister(): boolean {
  return isPushSupported() && !isPreviewOrDevEnvironment();
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function sameApplicationServerKey(sub: PushSubscription, want: Uint8Array): boolean {
  const have = sub.options.applicationServerKey
    ? new Uint8Array(sub.options.applicationServerKey as ArrayBuffer)
    : null;
  return !!have && have.length === want.length && have.every((b, i) => b === want[i]);
}

async function subscribeAndSave(): Promise<void> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

  let sub = await registration.pushManager.getSubscription();
  if (sub && !sameApplicationServerKey(sub, applicationServerKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });
  }

  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: keys["p256dh"] ?? "",
    p_auth: keys["auth"] ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/** Must be called synchronously inside the triggering button's click handler. */
export async function enablePush(): Promise<EnablePushResult> {
  if (!canRegister()) return { status: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission === "denied") return { status: "denied" };
  if (permission !== "granted") return { status: "dismissed" };
  try {
    await subscribeAndSave();
    return { status: "granted" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Quietly re-links an already-granted subscription — never prompts. */
export async function refreshPushSubscription(): Promise<void> {
  if (!canRegister()) return;
  if (Notification.permission !== "granted") return;
  try {
    await subscribeAndSave();
  } catch {
    // Best-effort keep-alive; a failure here shouldn't surface to the user.
  }
}

/** Best-effort cleanup before logout — never blocks it. */
export async function removeCurrentPushSubscription(): Promise<void> {
  if (!canRegister()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
  } catch {
    // Best-effort; the next person's device simply keeps the row until
    // the server eventually cleans up a dead endpoint on send failure.
  }
}
