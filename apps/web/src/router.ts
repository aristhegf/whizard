import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "games" }
  | { name: "topics" }
  | { name: "jigsaw" }
  | { name: "room"; code: string }
  | { name: "account" }
  /** The avatar creator. Its `?back=` is where Save and Cancel go. */
  | { name: "avatar" }
  | { name: "friends" }
  | { name: "add"; username: string }
  | { name: "group"; id: string }
  | { name: "privacy" }
  | { name: "stats" }
  | { name: "pricing" }
  | { name: "about" }
  /** `item` is one thing in the section, e.g. the question being edited. */
  | { name: "admin"; section: string; item: string | null };

const ROOM_PATH = /^\/r\/([^/]+)\/?$/;

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const match = ROOM_PATH.exec(path);
  if (match) return { name: "room", code: decodeURIComponent(match[1] ?? "") };
  if (/^\/games\/?$/.test(path)) return { name: "games" };
  if (/^\/games\/quiz\/?$/.test(path)) return { name: "topics" };
  if (/^\/games\/jigsaw\/?$/.test(path)) return { name: "jigsaw" };
  if (/^\/account\/?$/.test(path)) return { name: "account" };
  if (/^\/avatar\/?$/.test(path)) return { name: "avatar" };
  if (/^\/friends\/?$/.test(path)) return { name: "friends" };
  const add = /^\/add\/([^/]+)\/?$/.exec(path);
  if (add) return { name: "add", username: decodeURIComponent(add[1] ?? "") };
  const group = /^\/groups\/([^/]+)\/?$/.exec(path);
  if (group) return { name: "group", id: decodeURIComponent(group[1] ?? "") };
  if (/^\/privacy\/?$/.test(path)) return { name: "privacy" };
  if (/^\/stats\/?$/.test(path)) return { name: "stats" };
  if (/^\/pricing\/?$/.test(path)) return { name: "pricing" };
  if (/^\/about\/?$/.test(path)) return { name: "about" };
  const admin = /^\/admin(?:\/([a-z-]+)(?:\/([a-z0-9_-]+))?)?\/?$/.exec(path);
  if (admin) return { name: "admin", section: admin[1] ?? "dashboard", item: admin[2] ?? null };
  return { name: "home" };
}

export function roomPath(code: string): string {
  return `/r/${encodeURIComponent(code)}`;
}

export function navigate(path: string): void {
  const [target, hash] = path.split("#");
  if (path !== location.pathname + location.search + location.hash) {
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  if (hash) {
    // Wait a frame so the page for the new path has rendered.
    requestAnimationFrame(() =>
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }),
    );
  } else if (target !== undefined) {
    window.scrollTo(0, 0);
  }
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
