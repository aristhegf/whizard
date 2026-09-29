import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Tooltip } from "@/components/motion/tooltip";
import type { GameId } from "@whizard/game-core";
import { useState, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom, ServerRefusal } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { AccountMenu } from "./AccountMenu";
import { Icon, type IconName } from "./Icon";
import { JoinRoomBox } from "./JoinRoomBox";
import { LiveCount } from "./LiveCount";
import { LogoMark } from "./Logo";
import { useToast } from "./toast";

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

/** "Create a Room": says it's working, and offers to try again if the room couldn't be made. */
export function CreateRoomButton({ className }: { className: string }) {
  const [state, setState] = useState<ButtonState>("idle");
  const toast = useToast();
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

/** Every link about the site, in the footer. */
const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/about", section: "about" },
  { label: "Stats", href: "/stats", section: "stats" },
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
 * The bar across the top of every page outside a game: Play, Create, Stats and Leaderboard, a
 * box for joining a room by its code, who's here, friend requests and the account menu. Phones
 * keep the logo and the code box, with the rest in the tabs at the bottom.
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
      <Icon name={l.icon} size={22} />
      {l.label}
    </a>
  );

  return (
    <header className="topnav app-bar">
      <Brand />
      <nav className="nav-links" aria-label="Main">
        {navLink(PLAY)}
        <button className="nav-link nav-create" disabled={creating} onClick={create}>
          <Icon name="plusCircle" size={22} />
          Create
        </button>
        {navLink(STATS)}
        {navLink(LEADERBOARD)}
      </nav>
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
    </header>
  );
}

/** The links about the site, at the bottom of the pages that scroll. */
function SiteFooter({ active }: { active: Section }) {
  return (
    <footer className="site-footer">
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
  children,
}: {
  active: Section;
  className?: string;
  column?: boolean;
  /** Fits the screen on laptops and computers, like an app, with no footer to scroll to. */
  screen?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`page${screen ? " app-screen" : ""} ${className ?? ""}`}>
      <TopNav active={active} />
      {column ? <div className="page-main">{children}</div> : children}
      {!screen && <SiteFooter active={active} />}
      <TabBar active={active} />
    </div>
  );
}
