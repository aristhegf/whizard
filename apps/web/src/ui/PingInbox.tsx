import type { WaitingPing } from "@whizard/protocol";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account";
import { fetchPings } from "../pings";
import { linkTo, roomPath } from "../router";
import { play } from "../sounds";
import { Icon } from "./Icon";

/** How often an open page asks whether a friend has pinged. */
const CHECK_EVERY_MS = 20_000;
/** The pings this browser has already joined or dismissed, so they don't come up again. */
const SEEN_KEY = "whizard.pings.seen";
const SEEN_KEPT = 30;

const keyOf = (ping: WaitingPing) => `${ping.from}:${ping.at}`;

function seenPings(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function markSeen(ping: WaitingPing) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenPings(), keyOf(ping)].slice(-SEEN_KEPT)));
  } catch {
    // Storage is full or blocked; the ping may come up again after a reload.
  }
}

/**
 * A friend's ping, on whichever page is open: "Ada wants to play", with Join. It's how a ping
 * arrives without notifications turned on; the page asks the server every little while, and when
 * it's looked at again after being in the background.
 */
export function PingInbox() {
  const account = useAccount();
  return account.status === "ready" && account.user ? <Pings /> : null;
}

function Pings() {
  const [ping, setPing] = useState<WaitingPing | null>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetchPings().then(
        ({ pings }) => {
          if (!live) return;
          const seen = seenPings();
          const next = pings.find((p) => !seen.includes(keyOf(p))) ?? null;
          // A chime for a ping that's new, not each time the same one is found again.
          if (next && shown.current !== keyOf(next)) play("join");
          shown.current = next ? keyOf(next) : null;
          setPing(next);
        },
        // Offline, or signed out elsewhere: try again next time.
        () => {},
      );
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!ping) return null;
  const done = () => {
    markSeen(ping);
    setPing(null);
  };
  const join = linkTo(roomPath(ping.room));

  return (
    <div className="ping-bar" role="region" aria-label="Ping from a friend">
      <Icon name="bell" size={20} />
      <span className="return-text">
        <strong>{ping.displayName}</strong> wants to play
      </span>
      <a
        className="btn btn-small btn-gold"
        href={join.href}
        onClick={(event) => {
          done();
          join.onClick(event);
        }}
      >
        Join
      </a>
      <button className="icon-btn" aria-label="Dismiss" onClick={done}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
