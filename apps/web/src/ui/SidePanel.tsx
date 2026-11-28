import { useState, useSyncExternalStore } from "react";
import { useAccount } from "../account";
import { GAME_GROUPS } from "../catalog";
import { linkTo, useSearchParam } from "../router";
import { Icon, type IconName } from "./Icon";
import { SettingsDialog } from "./SettingsDialog";

/**
 * The side panel, after CrazyGames' sidebar: a narrow strip of icons down the left, under the top
 * bar, with the page beside it. Resting the pointer on it (or tabbing into it) widens it over the
 * page with every item's name; nothing behind it moves, dims or blurs. The button beside the logo
 * hides the strip altogether, and the page takes the room; pressed again, it comes back.
 * Remembered on this device.
 */

const STORAGE_KEY = "whizard.sidePanel";
const listeners = new Set<() => void>();

function isShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSidePanel(shown: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, shown ? "shown" : "hidden");
  } catch {
    // Not remembered, then; it still hides and shows.
  }
  for (const listener of listeners) listener();
}

/** Whether the strip is showing, kept up to date. */
export function useSidePanel(): boolean {
  return useSyncExternalStore(subscribe, isShown, () => true);
}

/** The button beside the logo: hides the strip, or brings it back. */
export function MenuButton() {
  const shown = useSidePanel();
  return (
    <button
      className="icon-btn menu-toggle"
      aria-label={shown ? "Hide menu" : "Show menu"}
      aria-expanded={shown}
      aria-controls="side-panel"
      onClick={() => setSidePanel(!shown)}
    >
      <Icon name={shown ? "railHide" : "railShow"} size={24} />
    </button>
  );
}

/** Which part of the site a page is in, for the panel to light up. */
export type PanelSection =
  "games" | "stats" | "pricing" | "about" | "privacy" | "profile" | "friends" | "dashboard" | null;

export function SidePanel({
  active,
  onCreate,
  creating,
}: {
  active: PanelSection;
  onCreate: () => void;
  creating: boolean;
}) {
  const shown = useSidePanel();
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const kind = useSearchParam("kind");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const link = (href: string, icon: IconName, label: string, current = false, group?: string) => (
    <a
      className="rail-item"
      data-group={group}
      aria-current={current ? "page" : undefined}
      {...linkTo(href)}
    >
      <Icon name={icon} size={20} />
      <span className="rail-label">{label}</span>
    </a>
  );

  const onGames = active === "games";
  return (
    <>
      <aside id="side-panel" className="side-rail" hidden={!shown} aria-label="Menu">
        <nav className="rail-nav" aria-label="Main">
          {link("/games", "games", "Games", onGames && !kind)}
          {/* The kinds of game, under Games: each picks the games on the Games page. */}
          {GAME_GROUPS.filter((g) => g.id !== "all").map((g) => (
            <span key={g.id} className="rail-kind">
              {link(
                `/games?kind=${g.id}`,
                g.icon ?? "grid",
                g.name,
                onGames && kind === g.id,
                g.id,
              )}
            </span>
          ))}
          <button className="rail-item rail-create" disabled={creating} onClick={onCreate}>
            <Icon name="plusCircle" size={20} />
            <span className="rail-label">{creating ? "Creating…" : "Create a room"}</span>
          </button>
          <hr />
          {link("/stats#top-players-title", "trophy", "Leaderboard")}
          {link("/stats", "chart", "Stats", active === "stats")}
          {link("/pricing", "wallet", "Pricing", active === "pricing")}
          <hr />
          {user ? (
            <>
              {link("/account", "user", "My profile", active === "profile")}
              {link("/friends", "users", "Friends", active === "friends")}
              {link("/dashboard", "chart", "Study dashboard", active === "dashboard")}
              {link("/banks", "layers", "Question banks")}
            </>
          ) : (
            link("/account", "user", "Sign in", active === "profile")
          )}
          <button className="rail-item" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={20} />
            <span className="rail-label">Settings</span>
          </button>
          <hr />
          {link("/about", "info", "About", active === "about")}
          {link("/privacy", "lock", "Privacy", active === "privacy")}
          <p className="rail-label rail-copy">© {new Date().getFullYear()} Whizard</p>
        </nav>
      </aside>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
