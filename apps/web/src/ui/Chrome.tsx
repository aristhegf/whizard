import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { Tooltip } from "@/components/motion/tooltip";
import type { GameId } from "@whizard/game-core";
import { useState, type MouseEvent, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom, ServerRefusal } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { useToast } from "./toast";
import { LogoMark } from "./Logo";
import { SettingsButton, SettingsDialog } from "./SettingsDialog";

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

/** The profile picture, or Sign In for guests (except on the sign-in page itself). */
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

const NAV_LINKS: { label: string; href: string; section: Section }[] = [
  { label: "Games", href: "/games", section: "games" },
  { label: "Quiz Topics", href: "/games/quiz", section: "topics" },
  { label: "Friends", href: "/friends", section: "friends" },
];

/** About the site rather than playing: in the footer and the phone menu. */
const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "How It Works", href: "/#how" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/about", section: "about" },
  { label: "Stats", href: "/stats", section: "stats" },
  { label: "Privacy", href: "/privacy" },
];

/** The bar across the top of every page outside a game: full links on wide screens, a menu on phones. */
export function TopNav({
  active = null,
  children,
}: {
  active?: Section;
  /** Extra items before the profile link, such as a search box. */
  children?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const account = useAccount();
  const toast = useToast();
  const signedIn = account.status === "ready" && !!account.user;

  return (
    <header className="topnav">
      <button
        className="icon-btn menu-btn"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <Icon name="menu" size={26} />
      </button>
      <Brand />
      <nav className="nav-links" aria-label="Main">
        {NAV_LINKS.map((l) => (
          <a
            key={l.label}
            className="nav-link"
            aria-current={active === l.section ? "page" : undefined}
            {...linkTo(l.href)}
          >
            {l.label}
          </a>
        ))}
        <button
          className="nav-link"
          onClick={() =>
            startRoom().catch((error: unknown) =>
              toast.show({ title: createFailed(error), status: "error" }),
            )
          }
        >
          Create
        </button>
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
        <span className="nav-settings">
          <SettingsButton />
        </span>
        <MeLink active={active} />
      </div>
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </header>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const signedIn = account.status === "ready" && !!account.user;
  const items: { label: string; href: string; icon: IconName }[] = [
    { label: "Home", href: "/", icon: "home" },
    { label: "Games", href: "/games", icon: "games" },
    { label: "Quiz topics", href: "/games/quiz", icon: "star" },
    { label: "Friends", href: "/friends", icon: "users" },
    { label: signedIn ? "My profile" : "Sign in", href: "/account", icon: "user" },
  ];
  const go = (href: string) => {
    const link = linkTo(href);
    return {
      href: link.href,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        link.onClick(event);
        onClose();
      },
    };
  };
  return (
    <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="topnav">
        <Brand />
        <button className="icon-btn" aria-label="Close menu" onClick={onClose}>
          <Icon name="close" size={26} />
        </button>
      </div>
      <nav aria-label="Main">
        {items.map((item) => (
          <a key={item.href} className="menu-item" {...go(item.href)}>
            <Icon name={item.icon} />
            {item.label}
          </a>
        ))}
        <button className="menu-item" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" />
          Settings
        </button>
        <div className="menu-site">
          {SITE_LINKS.map((l) => (
            <a key={l.href} {...go(l.href)}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
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

/** The bottom tabs on phones: Home, Games, Create and Profile. */
export function TabBar({ active = null }: { active?: Section }) {
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const tabs: { label: string; href: string; icon: IconName; section: Section }[] = [
    { label: "Home", href: "/", icon: "home", section: "home" },
    { label: "Games", href: "/games", icon: "games", section: "games" },
  ];
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map((t) => (
        <a
          key={t.label}
          className="tab"
          aria-current={
            active === t.section || (t.section === "games" && active === "topics")
              ? "page"
              : undefined
          }
          {...linkTo(t.href)}
        >
          <Icon name={t.icon} size={24} />
          {t.label}
        </a>
      ))}
      <button
        className="tab"
        disabled={creating}
        onClick={() => {
          setCreating(true);
          startRoom().catch((error: unknown) => {
            setCreating(false);
            toast.show({ title: createFailed(error), status: "error" });
          });
        }}
      >
        <Icon name="plusCircle" size={24} />
        Create
      </button>
      <a
        className="tab"
        aria-current={active === "profile" || active === "friends" ? "page" : undefined}
        {...linkTo("/account")}
      >
        <Icon name="user" size={24} />
        Profile
      </a>
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
