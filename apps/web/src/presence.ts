import {
  parsePresenceServerMessage,
  SOURCE_PATTERN,
  type DeviceType,
  type PageName,
  type PresenceClientMessage,
} from "@whizard/protocol";
import { useSyncExternalStore } from "react";
import type { Route } from "./router";
import { visitorId } from "./storage";

/**
 * One small WebSocket per tab to the presence service. It gives the live counts on the home
 * page, and tells the stats which pages are viewed. A tab left in the background stops
 * counting as "here now" after a couple of minutes.
 */

export interface PresenceCounts {
  online: number;
  visitors: number;
}

const PING_INTERVAL_MS = 30_000;
const HIDDEN_GRACE_MS = 2 * 60_000;
const MAX_RETRY_MS = 60_000;

let counts: PresenceCounts | null = null;
const listeners = new Set<() => void>();

let socket: WebSocket | null = null;
let started = false;
let page: PageName = "home";
let visited = false;
let paused = false;
let retryMs = 1_000;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let source: string | null = null;

export function pageOf(route: Route): PageName {
  return route.name;
}

/** Called on every route change. The first call opens the connection. */
export function reportPage(next: PageName): void {
  const changed = next !== page;
  page = next;
  if (!started) {
    start();
    return;
  }
  if (changed && visited) send({ type: "view", page });
}

export function usePresence(): PresenceCounts | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => counts,
  );
}

function start() {
  started = true;
  source = sourceName(
    document.referrer,
    new URLSearchParams(location.search).get("utm_source"),
    location.hostname,
  );
  document.addEventListener("visibilitychange", onVisibility);
  connect();
  if (document.hidden) onVisibility();
}

function connect() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  if (paused || socket) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/api/presence`);
  socket = ws;

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: "hello",
        visitor: visitorId(),
        page,
        device: deviceType(),
        source,
        newVisit: !visited,
      } satisfies PresenceClientMessage),
    );
    visited = true;
    retryMs = 1_000;
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    const message = parsePresenceServerMessage(event.data);
    if (!message) return;
    counts = { online: message.online, visitors: message.visitors };
    for (const listener of listeners) listener();
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    if (socket === ws) socket = null;
    if (paused) return;
    retryTimer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  };
}

function send(message: PresenceClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function onVisibility() {
  clearTimeout(hideTimer);
  if (document.hidden) {
    hideTimer = setTimeout(() => {
      paused = true;
      clearTimeout(retryTimer);
      retryTimer = undefined;
      socket?.close(1000, "Hidden");
    }, HIDDEN_GRACE_MS);
  } else if (paused) {
    paused = false;
    connect();
  }
}

/** The same breakpoints as the layout. */
function deviceType(): DeviceType {
  const width = Math.min(window.innerWidth, screen.width || window.innerWidth);
  return width < 768 ? "phone" : width < 1100 ? "tablet" : "desktop";
}

/**
 * Turns a `utm_source` tag or the referring site into a short source name, or null when there
 * isn't one: no referrer, or a link from this site.
 */
export function sourceName(referrer: string, campaign: string | null, ownHost: string) {
  const tag = campaign
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 64);
  if (tag) return tag;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === ownHost.toLowerCase().replace(/^www\./, "")) return null;
    return SOURCE_PATTERN.test(host) ? host : null;
  } catch {
    return null;
  }
}
