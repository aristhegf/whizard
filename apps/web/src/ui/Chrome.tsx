import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Tooltip } from "@/components/motion/tooltip";
import type { GameId } from "@whizard/game-core";
import { useState, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom, ServerRefusal } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { useToast } from "./toast";
import { LogoMark } from "./Logo";
import { SettingsButton } from "./SettingsDialog";

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

/**
 * The profile picture, or Sign In for guests (except on the sign-in page itself). On phones the
 * picture is in the tabs at the bottom instead.
 */
function MeLink({ active, size = 44 }: { active: Section; size?: number }) {
  const account = useAccount();
  if (account.status === "loading") return <span style={{ width: size, height: size }} />;
  if (!account.user) {
    if (active === "profile") return null;
    return (
      <a className="btn signin-btn" {...linkTo("/account")}>
        Sign In
      </a>
    );
  }
  return (
    <a
      className="me-link"
      {...linkTo("/account")}
      aria-label={`Your profile, ${account.user.displayName}`}
    >
      <Avatar id={account.user.avatar} name={account.user.username} size={size} />
    </a>
  );
}

type NavLink = { label: string; href: string; section: Section };

/** The top bar's links: about the site for guests, the games and friends once signed in. */
const GUEST_LINKS: NavLink[] = [
  { label: "Games", href: "/games", section: "games" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/about", section: "about" },
  { label: "Stats", href: "/stats", section: "stats" },
];

const MEMBER_LINKS: NavLink[] = [
  { label: "Games", href: "/games", section: "games" },
  { label: "Friends", href: "/friends", section: "friends" },
];

/** Every link about the site, in the footer. */
const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "How It Works", href: "/#how" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/about", section: "about" },
  { label: "Stats", href: "/stats", section: "stats" },
  { label: "Privacy", href: "/privacy" },
];

/** The Quiz Topics page belongs to Games. */
const isActive = (active: Section, section: Section) =>
  active !== null && (active === section || (section === "games" && active === "topics"));

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
 * The bar across the top of every page outside a game. Guests get Games, Pricing, About and
 * Stats; signed-in players get Games, Friends and Create. Phones show only the logo, Settings
 * and Sign In here, with the links in the tabs at the bottom.
 */
export function TopNav({
  active = null,
  children,
}: {
  active?: Section;
  /** Extra items before the profile link, such as a search box. */
  children?: ReactNode;
}) {
  const account = useAccount();
  const { creating, create } = useCreateRoom();
  const signedIn = account.status === "ready" && !!account.user;
  // Until the account has loaded, it isn't known which links to show.
  const links = account.status === "loading" ? [] : signedIn ? MEMBER_LINKS : GUEST_LINKS;

  return (
    <header className="topnav">
      <Brand />
      <nav className="nav-links" aria-label="Main">
        {links.map((l) => (
          <a
            key={l.label}
            className="nav-link"
            aria-current={isActive(active, l.section) ? "page" : undefined}
            {...linkTo(l.href)}
          >
            {l.label}
          </a>
        ))}
        {signedIn && (
          <button className="nav-link" disabled={creating} onClick={create}>
            Create
          </button>
        )}
      </nav>
      <div className="nav-end">
        {children}
        {signedIn && (
          <Tooltip content="Friend requests" side="bottom">
            <a className="icon-btn" {...linkTo("/friends")} aria-label="Friend requests">
              <Icon name="bell" size={24} />
            </a>
          </Tooltip>
        )}
        <SettingsButton />
        <MeLink active={active} />
      </div>
    </header>
  );
}

/** The links about the site, at the bottom of every page with the top bar. */
function SiteFooter({ active }: { active: Section }) {
  return (
    <footer className="site-footer">
      <nav aria-label="About Whizard">
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
 * The tabs at the bottom on phones. Guests: Games, Pricing, Stats and Profile. Signed in: Games,
 * Friends, Create and their own avatar for the profile.
 */
export function TabBar({ active = null }: { active?: Section }) {
  const account = useAccount();
  const { creating, create } = useCreateRoom();
  const user = account.status === "ready" ? account.user : null;
  const tab = (label: string, href: string, icon: IconName, section: Section) => (
    <a
      key={label}
      className="tab"
      aria-current={isActive(active, section) ? "page" : undefined}
      {...linkTo(href)}
    >
      <Icon name={icon} size={24} />
      {label}
    </a>
  );

  return (
    <nav className="tabbar" aria-label="Sections">
      {account.status === "loading" ? null : user ? (
        <>
          {tab("Games", "/games", "games", "games")}
          {tab("Friends", "/friends", "users", "friends")}
          <button className="tab" disabled={creating} onClick={create}>
            <Icon name="plusCircle" size={24} />
            Create
          </button>
          <a
            className="tab"
            aria-current={active === "profile" ? "page" : undefined}
            {...linkTo("/account")}
          >
            <Avatar id={user.avatar} name={user.username} size={26} />
            Profile
          </a>
        </>
      ) : (
        <>
          {tab("Games", "/games", "games", "games")}
          {tab("Pricing", "/pricing", "crown", "pricing")}
          {tab("Stats", "/stats", "chart", "stats")}
          {tab("Profile", "/account", "user", "profile")}
        </>
      )}
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
  children,
}: {
  active: Section;
  className?: string;
  column?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`page ${className ?? ""}`}>
      <TopNav active={active} />
      {column ? <div className="page-main">{children}</div> : children}
      <SiteFooter active={active} />
      <TabBar active={active} />
    </div>
  );
}
