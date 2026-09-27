import { StatefulButton, type ButtonState } from "@/components/motion/button/stateful";
import { useState, type ReactNode } from "react";
import { useAccount } from "../account";
import { createRoom } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { LogoMark } from "./Logo";

export type Section =
  "home" | "games" | "topics" | "friends" | "profile" | "pricing" | "stats" | null;

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
export async function startRoom(settings?: Record<string, unknown>) {
  navigate(roomPath(await createRoom(settings)));
}

const CREATE_FAILED = "Couldn’t create a room. Check your connection and try again.";

/** "Create a Room": says it's working, and offers to try again if the room couldn't be made. */
export function CreateRoomButton({
  className,
  onError,
}: {
  className: string;
  /** Told the error message, or null when trying again. */
  onError?: (message: string | null) => void;
}) {
  const [state, setState] = useState<ButtonState>("idle");
  return (
    <StatefulButton
      className={className}
      state={state}
      loadingText="Creating…"
      errorText="Try again"
      icon={<Icon name="arrowRight" size={24} stroke={2.4} />}
      onClick={() => {
        setState("loading");
        onError?.(null);
        startRoom().catch(() => {
          setState("error");
          onError?.(CREATE_FAILED);
        });
      }}
    >
      Create a Room
    </StatefulButton>
  );
}

function MeLink({ size = 44 }: { size?: number }) {
  const account = useAccount();
  if (account.status === "loading") return <span style={{ width: size, height: size }} />;
  if (!account.user) {
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

const SITE_LINKS: { label: string; href: string; section?: Section }[] = [
  { label: "Games", href: "/games" },
  { label: "How It Works", href: "/#how" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "About", href: "/#about" },
  { label: "Stats", href: "/stats", section: "stats" },
];

const APP_LINKS: { label: string; href: string; section: Section }[] = [
  { label: "Games", href: "/games", section: "games" },
  { label: "Quiz Topics", href: "/games/quiz", section: "topics" },
  { label: "Friends", href: "/friends", section: "friends" },
];

/** The bar across the top: full links on wide screens, a menu button on phones. */
export function TopNav({
  variant,
  active = null,
  children,
}: {
  variant: "site" | "app";
  active?: Section;
  /** Extra items before the profile link, such as a search box. */
  children?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const account = useAccount();
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
        {variant === "site"
          ? SITE_LINKS.map((l) => (
              <a
                key={l.label}
                className="nav-link"
                aria-current={l.section && active === l.section ? "page" : undefined}
                {...linkTo(l.href)}
              >
                {l.label}
              </a>
            ))
          : APP_LINKS.map((l) => (
              <a
                key={l.label}
                className="nav-link"
                aria-current={active === l.section ? "page" : undefined}
                {...linkTo(l.href)}
              >
                {l.label}
              </a>
            ))}
        {variant === "app" && (
          <button className="nav-link" onClick={() => void startRoom()}>
            Create
          </button>
        )}
      </nav>
      <div className="nav-end">
        {children}
        {variant === "app" && signedIn && (
          <a className="icon-btn" {...linkTo("/friends")} aria-label="Friend requests">
            <Icon name="bell" size={24} />
          </a>
        )}
        <MeLink />
      </div>
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </header>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const signedIn = account.status === "ready" && !!account.user;
  const items: { label: string; href: string; icon: IconName }[] = [
    { label: "Home", href: "/", icon: "home" },
    { label: "Games", href: "/games", icon: "games" },
    { label: "Quiz topics", href: "/games/quiz", icon: "star" },
    { label: "Friends", href: "/friends", icon: "users" },
    { label: signedIn ? "My profile" : "Sign in", href: "/account", icon: "user" },
    { label: "Pricing", href: "/pricing", icon: "crown" },
    { label: "Stats", href: "/stats", icon: "chart" },
    { label: "Privacy", href: "/privacy", icon: "settings" },
  ];
  return (
    <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="topnav">
        <Brand />
        <button className="icon-btn" aria-label="Close menu" onClick={onClose}>
          <Icon name="close" size={26} />
        </button>
      </div>
      <nav aria-label="Main">
        {items.map((item) => {
          const link = linkTo(item.href);
          return (
            <a
              key={item.href}
              className="menu-item"
              href={link.href}
              onClick={(event) => {
                link.onClick(event);
                onClose();
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/** The bottom tabs on phones: Home, Games, Create and Profile. */
export function TabBar({ active = null }: { active?: Section }) {
  const [creating, setCreating] = useState(false);
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
          startRoom().catch(() => setCreating(false));
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

const SIDE_LINKS: { label: string; href: string; icon: IconName; section: Section }[] = [
  { label: "Home", href: "/", icon: "home", section: "home" },
  { label: "Games", href: "/games", icon: "games", section: "games" },
  { label: "Friends", href: "/friends", icon: "users", section: "friends" },
  { label: "My Profile", href: "/account", icon: "user", section: "profile" },
  { label: "Settings", href: "/account#settings", icon: "settings", section: null },
];

function SideUser() {
  const account = useAccount();
  if (account.status !== "ready") return null;
  const user = account.user;
  return (
    <a className="side-user" {...linkTo("/account")}>
      <Avatar id={user?.avatar} name={user?.username ?? "guest"} size={64} />
      <span className="who">
        <strong>{user ? user.displayName : "Playing as a guest"}</strong>
        <span className="muted small">
          {user ? "View your profile" : "Sign in to keep your stats"}
        </span>
      </span>
    </a>
  );
}

/** App pages on wide screens: a sidebar on the left. On phones: the top bar and bottom tabs. */
export function SideLayout({
  active,
  className,
  children,
}: {
  active: Section;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`page wide ${className ?? ""}`}>
      <div className="side-layout">
        <aside className="sidebar panel" aria-label="Sections">
          <Brand />
          {SIDE_LINKS.map((l) => (
            <a
              key={l.label}
              className="side-link"
              aria-current={
                active === l.section || (l.section === "games" && active === "topics")
                  ? "page"
                  : undefined
              }
              {...linkTo(l.href)}
            >
              <Icon name={l.icon} size={26} />
              {l.label}
            </a>
          ))}
          <SideUser />
        </aside>
        <div className="side-main">
          <div className="phone-bar">
            <TopNav variant="app" active={active} />
          </div>
          {children}
        </div>
      </div>
      <TabBar active={active} />
    </div>
  );
}

/** Pages with the top bar: the landing page and the games list. */
export function TopLayout({
  variant,
  active,
  navExtra,
  children,
}: {
  variant: "site" | "app";
  active: Section;
  navExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <TopNav variant={variant} active={active}>
        {navExtra}
      </TopNav>
      {children}
      <TabBar active={active} />
    </div>
  );
}
