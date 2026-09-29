import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Tooltip } from "@/components/motion/tooltip";
import type { GameId } from "@whizard/game-core";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom, ServerRefusal } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { AccountMenu } from "./AccountMenu";
import { Icon, type IconName } from "./Icon";
import { JoinRoomBox } from "./JoinRoomBox";
import { LiveCount } from "./LiveCount";
import { LogoMark } from "./Logo";
import { useToast } from "./toast";
import { usePageReveal } from "./usePageReveal";

export type Section =
  "home" | "games" | "topics" | "friends" | "profile" | "pricing" | "about" | "stats" | null;

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
export function CreateRoomButton({ className }: { className: string }) {
  const [state, setState] = useState<ButtonState>("idle");
  const toast = useToast();
  useRemeasure();
  return (
    <StatefulButton
      className={className}
      state={state}
      loadingText="Creating…"
      errorText="Try again"
      icon={<Icon name="arrowRight" size={24} stroke={2.4} />}
      onClick={() => {
        setState("loading");
        startRoom().catch((error: unknown) => {
          setState("error");
          toast.show({ title: createFailed(error), status: "error" });
        });
      }}
    >
      Create a Room
    </StatefulButton>
  );
}

type NavLink = { label: string; href: string; icon: IconName; section: Section };

/** Play is the home screen of games; Stats and the leaderboard are on the Stats page. */
const PLAY: NavLink = { label: "Play", href: "/", icon: "games", section: "home" };
const STATS: NavLink = { label: "Stats", href: "/stats", icon: "chart", section: "stats" };
const LEADERBOARD: NavLink = {
  label: "Leaderboard",
  href: "/stats#top-players-title",
  icon: "trophy",
  section: null,
};
/** For guests, whose home page is the one that explains Whizard. */
const HOW: NavLink = { label: "How it works", href: "/#how", icon: "help", section: null };
const PRICING: NavLink = { label: "Pricing", href: "/pricing", icon: "wallet", section: "pricing" };

/** Every link about the site, in the footer. */
const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "About", href: "/about", section: "about" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "Privacy", href: "/privacy" },
];

/** The games pages all belong to Play. */
const isActive = (active: Section, section: Section) =>
  active !== null &&
  (active === section || (section === "home" && (active === "games" || active === "topics")));

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
 * The bar across the top of every page outside a game: the logo, links in the middle (Play,
 * Create, Stats and Leaderboard once signed in; How it works, Pricing and Stats for guests), then
 * the room-code box, who's here, friend requests and the account menu on the right. Phones keep
 * the logo and the code box, with the rest in the tabs at the bottom.
 */
export function TopNav({ active = null }: { active?: Section }) {
  const account = useAccount();
  const { creating, create } = useCreateRoom();
  const signedIn = account.status === "ready" && !!account.user;
  const navLink = (l: NavLink) => (
    <a
      key={l.label}
      className="nav-link"
      aria-current={isActive(active, l.section) ? "page" : undefined}
      {...linkTo(l.href)}
    >
      {l.label}
    </a>
  );

  return (
    <header className="topnav app-bar">
      <Brand />
      <nav className="nav-links" aria-label="Main">
        {/* Empty until the account is known, so neither set of links flashes up first. */}
        {account.status === "loading" ? null : signedIn ? (
          <>
            {navLink(PLAY)}
            <button className="nav-link" disabled={creating} onClick={create}>
              Create
            </button>
            {navLink(STATS)}
            {navLink(LEADERBOARD)}
          </>
        ) : (
          <>
            {navLink(HOW)}
            {navLink(PRICING)}
            {navLink(STATS)}
          </>
        )}
      </nav>
      <div className="topnav-end">
        <JoinRoomBox />
        <div className="nav-end">
          <LiveCount variant="bar" />
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

/** The tabs at the bottom on phones: Play, Create, Leaderboard, Stats and the account menu. */
export function TabBar({ active = null }: { active?: Section }) {
  const { creating, create } = useCreateRoom();
  const tab = (l: NavLink) => (
    <a
      key={l.label}
      className="tab"
      aria-current={isActive(active, l.section) ? "page" : undefined}
      {...linkTo(l.href)}
    >
      <Icon name={l.icon} size={24} />
      {l.label}
    </a>
  );

  return (
    <nav className="tabbar" aria-label="Sections">
      {tab(PLAY)}
      <button className="tab" disabled={creating} onClick={create}>
        <Icon name="plusCircle" size={24} />
        Create
      </button>
      {tab(LEADERBOARD)}
      {tab(STATS)}
      <AccountMenu variant="tab" />
    </nav>
  );
}

/**
 * Every page outside a game: the top bar, the page, the site links, and the tabs on phones.
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
  return (
    <div
      ref={ref}
      className={`page${screen ? " app-screen" : ""}${reveal ? ` reveal${ready ? " is-ready" : ""}` : ""} ${className ?? ""}`}
    >
      <TopNav active={active} />
      {column ? <div className="page-main">{children}</div> : children}
      <SiteFooter active={active} slim={screen} />
      <TabBar active={active} />
    </div>
  );
}
