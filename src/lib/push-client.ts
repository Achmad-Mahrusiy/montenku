// Browser-only helpers for the service worker and push subscription (D-037). Used by client components.

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone/iPad Safari only allows push for Montenku installed to the home screen. */
export const needsHomeScreen = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** This browser's current subscription, if any (without registering anything new). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe() wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** True when the subscription was made with this server key. One made with an old key cannot receive our pushes. */
export function madeWithKey(subscription: PushSubscription, base64url: string): boolean {
  const key = subscription.options.applicationServerKey;
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = keyBytes(base64url);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
