import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount } from "../account";
import { linkTo } from "../router";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { SettingsDialog } from "./SettingsDialog";

/**
 * The avatar in the top bar (and the "Me" tab on phones): a menu with the profile or Sign in,
 * friends and Settings.
 */
export function AccountMenu({ variant }: { variant: "bar" | "tab" }) {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // A tap anywhere else, or Escape, closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const link = (href: string, icon: IconName, label: ReactNode) => {
    const to = linkTo(href);
    return (
      <a
        className="account-menu-item"
        href={to.href}
        onClick={(event) => {
          setOpen(false);
          to.onClick(event);
        }}
      >
        <Icon name={icon} size={20} />
        {label}
      </a>
    );
  };

  const size = variant === "bar" ? 44 : 26;
  // Guests get the mascot rather than a stranger's face.
  const face = user ? (
    <Avatar id={user.avatar} name={user.username} size={size} />
  ) : (
    <span className="guest-face" style={{ "--size": `${size}px` } as CSSProperties}>
      <img src="/art/mascot/wave.webp" alt="" width={size} height={size} />
    </span>
  );

  return (
    <div className={`account-menu ${variant}`} ref={root}>
      <button
        className={variant === "bar" ? "account-chip" : "tab"}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          variant === "bar" ? (user ? `Menu for ${user.displayName}` : "Menu") : undefined
        }
        onClick={() => setOpen((o) => !o)}
      >
        {face}
        {variant === "tab" && "Me"}
      </button>
      {open && (
        <div className="account-menu-list panel" role="group" aria-label="Menu">
          {user ? (
            <>
              <p className="account-menu-who">
                <strong>{user.displayName}</strong>
                <span className="dim small">@{user.username}</span>
              </p>
              {link("/account", "user", "My profile")}
              {link("/friends", "users", "Friends")}
            </>
          ) : (
            link("/account", "user", "Sign in")
          )}
          <button
            className="account-menu-item"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Icon name="settings" size={20} />
            Settings
          </button>
        </div>
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
