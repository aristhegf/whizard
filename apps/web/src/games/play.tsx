import type { ReactNode } from "react";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { SettingsButton } from "../ui/SettingsDialog";

/**
 * The parts every game screen shares, in the night-and-purple look: a plain line of text at
 * the top left (how far along you are), bare Settings and Quit icons at the top right, a big
 * timer, the players' faces on phones, and a slim notice line at the bottom.
 */

export function PlayTop({
  label,
  latency,
  onQuit,
}: {
  /** "12 / 16 placed", "Round 4 / 10": plain text, no box. */
  label: ReactNode;
  latency: ReactNode;
  onQuit: () => void;
}) {
  return (
    <header className="play-top">
      <span className="play-count">{label}</span>
      <span className="play-icons">
        {latency}
        <SettingsButton iconOnly />
        <button className="icon-btn play-quit" aria-label="Quit" onClick={onQuit}>
          <Icon name="logout" size={22} />
        </button>
      </span>
    </header>
  );
}

/** "01:24" from milliseconds. */
export function bigClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PlayTimer({ ms, low = false }: { ms: number; low?: boolean }) {
  return (
    <p className={`play-timer${low ? " low" : ""}`} role="timer" aria-label="Time">
      {bigClock(ms)}
    </p>
  );
}

export interface Face {
  playerId: string;
  nickname: string;
  avatar: string | null;
  rank: number;
  /** Their score, or how far along they are. */
  value: string;
  gone?: boolean;
}

/** How many faces fit across a phone. */
const MAX_FACES = 5;

/**
 * The scores on a phone: each player's avatar with their place and score, no names. Tablets
 * and computers show the full board with names instead.
 */
export function PlayFaces({ faces, playerId }: { faces: Face[]; playerId: string }) {
  if (faces.length < 2) return null;
  let shown = faces.slice(0, MAX_FACES);
  const me = faces.find((f) => f.playerId === playerId);
  // You're always in the row, in the last seat if you're further down.
  if (me && !shown.includes(me)) shown = [...shown.slice(0, MAX_FACES - 1), me];
  return (
    <ol className="play-faces" aria-label="Scores">
      {shown.map((f) => {
        const mine = f.playerId === playerId;
        return (
          <li
            key={f.playerId}
            className={`${mine ? "me" : ""}${f.gone ? " gone" : ""}`}
            aria-label={`${mine ? "You" : f.nickname}, ${ordinal(f.rank)}, ${f.value}`}
          >
            <span className="play-face">
              <Avatar id={f.avatar} name={f.nickname} size={46} />
              <span className={`play-place${f.rank === 1 ? " first" : ""}`} aria-hidden="true">
                {f.rank}
              </span>
            </span>
            <span className="play-score" aria-hidden="true">
              {f.value}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
