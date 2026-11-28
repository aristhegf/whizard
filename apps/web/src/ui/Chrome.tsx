import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Tooltip } from "@/components/motion/tooltip";
import type { GameId } from "@whizard/game-core";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom, ServerRefusal } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { AccountMenu } from "./AccountMenu";
import { Icon } from "./Icon";
import { JoinRoomBox } from "./JoinRoomBox";
import { LogoMark } from "./Logo";
import { MenuButton, SidePanel, useSidePanel, type PanelSection } from "./SidePanel";
import { useToast } from "./toast";
import { usePageReveal } from "./usePageReveal";

export type Section =
  | "home"
  | "welcome"
  | "games"
  | "topics"
  | "friends"
  | "profile"
  | "pricing"
  | "about"
  | "stats"
  | "dashboard"
  | "privacy"
  | null;

export function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />;
}

export function Brand() {
  return (
    <a className="brand" translate="no" {...linkTo("/")} aria-label="Whizard home">
      <LogoMark />
      <span>Whizard</span>
    </a>
  );
}

/** Opens a new room and goes to its lobby. */
export async function startRoom(settings?: Record<string, unknown>, game?: GameId) {
  navigate(roomPath(await createRoom(settings, game)));
}

const CREATE_FAILED = "Couldn’t create a room. Check your connection and try again.";

/** What to tell someone whose room couldn't be made: the server's reason, if it gave one. */
export const createFailed = (error: unknown) =>
  error instanceof ServerRefusal ? error.message : CREATE_FAILED;

/**
 * Renders again when web fonts finish loading or the window changes size. The stateful button
 * measures its label once per render, so a label measured in the fallback font, or before the
 * screen width changed its font size, would stay too narrow and clip its last letter.
 */
function useRemeasure() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    document.fonts.addEventListener("loadingdone", bump);
    void document.fonts.ready.then(bump);
    window.addEventListener("resize", bump);
    return () => {
      document.fonts.removeEventListener("loadingdone", bump);
      window.removeEventListener("resize", bump);
    };
  }, []);
}

/** "Create a Room": says it's working, and offers to try again if the room couldn't be made. */
export function CreateRoomButton({
  className,
  label = "Create a Room",
  arrow = true,
}: {
  className: string;
  label?: string;
  /** The arrow after the label. */
  arrow?: boolean;
}) {
  const [state, setState] = useState<ButtonState>("idle");
  const toast = useToast();
  useRemeasure();
  return (
    <StatefulButton
      className={className}
      state={state}
      loadingText="Creating…"
      errorText="Try again"
      icon={arrow ? <Icon name="arrowRight" size={24} stroke={2.4} /> : undefined}
      onClick={() => {
        setState("loading");
        startRoom().catch((error: unknown) => {
          setState("error");
          toast.show({ title: createFailed(error), status: "error" });
        });
      }}
    >
      {label}
    </StatefulButton>
  );
}

/** Every link about the site, in the footer. */
const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "About", href: "/about", section: "about" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "Privacy", href: "/privacy", section: "privacy" },
];

/** Where a page sits in the side panel. */
const panelSection = (active: Section): PanelSection => {
  if (active === "home" || active === "games" || active === "topics") return "games";
  if (active === "welcome") return null;
  return active;
};

/** Starts a room, and says so if it couldn't. */
function useCreateRoom() {
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const create = () => {
    setCreating(true);
    startRoom().catch((error: unknown) => {
      setCreating(false);
      toast.show({ title: createFailed(error), status: "error" });
    });
  };
  return { creating, create };
}

/**
 * The bar across the top of every page outside a game: the menu button (which opens the side
 * panel with everything else), the logo, then the room-code box, friend requests and the
 * account menu on the right.
 */
export function TopNav() {
  const account = useAccount();
  const signedIn = account.status === "ready" && !!account.user;
  return (
    <header className="topnav app-bar">
      <div className="topnav-start">
        <MenuButton />
        <Brand />
      </div>
      <div className="topnav-end">
        <JoinRoomBox />
        <div className="nav-end">
          {signedIn && (
            <Tooltip content="Friend requests" side="bottom">
              <a className="icon-btn bell-btn" {...linkTo("/friends")} aria-label="Friend requests">
                <Icon name="bell" size={24} />
              </a>
            </Tooltip>
          )}
          <AccountMenu variant="bar" />
        </div>
      </div>
    </header>
  );
}

/**
 * The links about the site: at the bottom of the pages that scroll, and as one slim row under
 * the screens that fit the window.
 */
function SiteFooter({ active, slim = false }: { active: Section; slim?: boolean }) {
  return (
    <footer className={slim ? "site-footer slim" : "site-footer"}>
      <nav aria-label="Site">
        {SITE_LINKS.map((l) => (
          <a
            key={l.href}
            aria-current={l.section && active === l.section ? "page" : undefined}
            {...linkTo(l.href)}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <span className="dim small">© {new Date().getFullYear()} Whizard</span>
    </footer>
  );
}

/**
 * Every page outside a game: the top bar, the side panel, the page and the site links.
 * `column` sets the page out as one column of panels, as the account and topic pages do.
 */
export function TopLayout({
  active,
  className,
  column = false,
  screen = false,
  reveal = false,
  children,
}: {
  active: Section;
  className?: string;
  column?: boolean;
  /** Fits the screen on laptops and computers, like an app, with a slim row of links under it. */
  screen?: boolean;
  /** Shows the screen all at once when its pictures and fonts are ready, not piece by piece. */
  reveal?: boolean;
  children: ReactNode;
}) {
  const { ref, ready } = usePageReveal(reveal);
  const { creating, create } = useCreateRoom();
  const panelOpen = useSidePanel();
  // The page moves over for the strip while it shows (see `html[data-rail]` in base.css).
  useEffect(() => {
    document.documentElement.dataset.rail = panelOpen ? "shown" : "hidden";
    return () => {
      delete document.documentElement.dataset.rail;
    };
  }, [panelOpen]);
  return (
    <>
      <SidePanel active={panelSection(active)} onCreate={create} creating={creating} />
      <div
        ref={ref}
        className={`page${screen ? " app-screen" : ""}${reveal ? ` reveal${ready ? " is-ready" : ""}` : ""} ${className ?? ""}`}
      >
        <TopNav />
        {column ? <div className="page-main">{children}</div> : children}
        <SiteFooter active={active} slim={screen} />
      </div>
    </>
  );
}
