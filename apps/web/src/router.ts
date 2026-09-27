import { useSyncExternalStore } from "react";

export type Route =
  { name: "home" } | { name: "room"; code: string } | { name: "account" } | { name: "privacy" };

const ROOM_PATH = /^\/r\/([^/]+)\/?$/;

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const match = ROOM_PATH.exec(path);
  if (match) return { name: "room", code: decodeURIComponent(match[1] ?? "") };
  if (/^\/account\/?$/.test(path)) return { name: "account" };
  if (/^\/privacy\/?$/.test(path)) return { name: "privacy" };
  return { name: "home" };
}

export function roomPath(code: string): string {
  return `/r/${encodeURIComponent(code)}`;
}

export function navigate(path: string): void {
  if (path === location.pathname + location.search) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

/** Props for an in-app link: a real href, handled without a page load. */
export function linkTo(path: string) {
  return {
    href: path,
    onClick: (event: { preventDefault(): void; metaKey: boolean; ctrlKey: boolean }) => {
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      navigate(path);
    },
  };
}
