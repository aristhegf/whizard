import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Listener = (text: ReactNode) => void;

/**
 * Carries "Tolu joined the game" and the like to a game screen's slim line at the bottom
 * (PlayToast). Only while one is on screen: otherwise the room shows its usual toast.
 */
export class GameNotices {
  private listeners = new Set<Listener>();

  /** Shows the notice in the game's bottom line. False when no game screen is listening. */
  say(text: ReactNode): boolean {
    if (this.listeners.size === 0) return false;
    for (const listener of this.listeners) listener(text);
    return true;
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const GameNoticeContext = createContext<GameNotices | null>(null);

/** How long a notice stays in the bottom line. */
const NOTICE_MS = 4000;

/** One slim line of text at the bottom of a game screen: who joined, left or came back. */
export function PlayToast() {
  const notices = useContext(GameNoticeContext);
  const [notice, setNotice] = useState<{ id: number; text: ReactNode } | null>(null);

  useEffect(() => {
    if (!notices) return;
    let id = 0;
    return notices.listen((text) => setNotice({ id: ++id, text }));
  }, [notices]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Always there, so the line doesn't push the screen about and screen readers hear each one.
  return (
    // A polite live region, not a status: the game's own status (Solved, Skipped) comes first.
    <p className="play-toast" aria-live="polite">
      {notice && <span key={notice.id}>{notice.text}</span>}
    </p>
  );
}
