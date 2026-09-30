import type { PingResult, WaitingPing } from "@whizard/protocol";
import { api, updateAccount } from "./account";

export type PingSupport = "ready" | "needs-install" | "unsupported";

function isAppleMobile(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Whether this browser can get pings. iPhones can, once Whizard is on the home screen. */
export function pingSupport(): PingSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "ready";
  }
  return isAppleMobile() ? "needs-install" : "unsupported";
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pingSupport() !== "ready") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Whether pings reach this browser right now. */
export async function pingsOnThisDevice(): Promise<boolean> {
  return (await currentSubscription()) !== null && Notification.permission === "granted";
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function enablePings(): Promise<void> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "Notifications are blocked for Whizard. Allow them in your browser’s site settings, then try again.",
    );
  }
  const { publicKey } = await api<{ publicKey: string }>("/api/push/key");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await api("/api/push/subscriptions", { method: "POST", body: subscription.toJSON() });
  // Quiet hours are kept in the time zone the phone is in.
  await updateAccount({ timeZone: localTimeZone() });
}

/** Stops pings to this browser, e.g. before signing out on a shared computer. */
export async function disablePings(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await api("/api/push/subscriptions", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
    });
  } finally {
    await subscription.unsubscribe();
  }
}

/** Asks a friend to join a room. `sent` is false if their settings held it back. */
export const pingFriend = (username: string, room: string) =>
  api<PingResult>(`/api/friends/${encodeURIComponent(username)}/ping`, {
    method: "POST",
    body: { room },
  });

/** The pings waiting for whoever's signed in: friends asking them to join a room. */
export const fetchPings = () => api<{ pings: WaitingPing[] }>("/api/pings");
