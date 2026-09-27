import { useSyncExternalStore } from "react";

export type Route = { name: "home" } | { name: "room"; code: string };

const ROOM_PATH = /^\/r\/([^/]+)\/?$/;

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const match = ROOM_PATH.exec(path);
  return match ? { name: "room", code: decodeURIComponent(match[1] ?? "") } : { name: "home" };
}

export function roomPath(code: string): string {
  return `/r/${encodeURIComponent(code)}`;
}

export function navigate(path: string): void {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
