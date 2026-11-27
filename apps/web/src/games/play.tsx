import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CATALOG } from "../catalog";
import { usePrefersStill } from "../display";
import { PlayToast } from "../ui/gameNotice";
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

/** Seconds left, rounded up, as the big timer's milliseconds: 8.4s left shows 00:09. */
export const timerMs = (remaining: number) => Math.ceil(Math.max(0, remaining) / 1000) * 1000;

/**
 * The big timer. Given the whole time (`totalMs`), a bar under it drains with the clock, in the
 * game's own colour, turning red and pulsing once time runs `low`.
 */
export function PlayTimer({
  ms,
  low = false,
  totalMs,
}: {
  ms: number;
  low?: boolean;
  totalMs?: number;
}) {
  const clock = (
    <p className={`play-timer${low ? " low" : ""}`} role="timer" aria-label="Time">
      {bigClock(ms)}
    </p>
  );
  if (!totalMs) return clock;
  const left = Math.max(0, Math.min(1, ms / totalMs));
  return (
    <>
      {clock}
      <div className={`play-timer-bar${low ? " low" : ""}`} aria-hidden="true">
        <i style={{ transform: `scaleX(${left})` }} />
      </div>
    </>
  );
}

/**
 * Counts up to `value` over a moment, for points arriving. Straight to it when motion is turned
 * down, on the device or in Whizard's own settings.
 */
export function useCountUp(value: number, ms = 650): number {
  const still = usePrefersStill();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Fast, then settling on the number.
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms, still]);
  return still ? value : shown;
}

/** Right, wrong, out of time, or simply how it went (neither right nor wrong). */
export type VerdictTone = "good" | "bad" | "late" | "info";

/**
 * How your answer went, as a moment rather than a line of text: a mark that pops in, the word
 * big, and the points counting up. A right answer glows, a wrong one shakes.
 */
export function PlayVerdict({
  tone,
  children,
  points = 0,
}: {
  tone: VerdictTone;
  /** "Correct", "Wrong", "Time's up". */
  children: ReactNode;
  points?: number;
}) {
  const counted = useCountUp(points);
  const icon =
    tone === "good" ? "check" : tone === "bad" ? "close" : tone === "late" ? "clock" : "star";
  return (
    <p className={`play-verdict ${tone}`} role="status">
      <span className="play-verdict-mark" aria-hidden="true">
        <Icon name={icon} size={26} stroke={3} />
      </span>
      <span className="play-verdict-word">{children}</span>
      {points > 0 && (
        <span className="play-verdict-points" aria-label={`plus ${points} points`}>
          +{counted.toLocaleString()}
        </span>
      )}
    </p>
  );
}

/** Mistakes left, as dots: purple while you have them, night-blue once used. */
export function PlayMistakes({ left, max }: { left: number; max: number }) {
  return (
    <div className="play-mistakes" aria-label={`${left} mistakes left`}>
      <span className="muted small">Mistakes left</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`play-dot${i < left ? "" : " used"}`} />
      ))}
    </div>
  );
}

/**
 * One player's line in a game's scores: the phone's faces and the computer's board both draw
 * from these, so every game hands over the same rows.
 */
export interface Face {
  playerId: string;
  nickname: string;
  avatar: string | null;
  rank: number;
  /** Their score, or how far along they are: "1,240", "5/16", "Out · R2". */
  value: string;
  /** Left, or knocked out: shown dimmed. */
  gone?: boolean;
  /** How close to the leader, 0 to 1, for a bar under the name. */
  bar?: number;
  /** A small mark after the name on the board: a streak, a place gained. */
  tag?: ReactNode;
}

/**
 * A game's standings as score lines for the faces and the board: the game says what to show
 * for each player (a score, "5/16", a time).
 */
export function rowsFrom<
  S extends { playerId: string; nickname: string; rank: number; left?: boolean },
>(
  standings: readonly S[],
  room: { players: readonly { id: string; avatar: string | null }[] },
  value: (standing: S) => string,
): Face[] {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  return standings.map((s) => ({
    playerId: s.playerId,
    nickname: s.nickname,
    avatar: avatars.get(s.playerId) ?? null,
    rank: s.rank,
    value: s.left ? "Left" : value(s),
    gone: !!s.left,
  }));
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

/**
 * The scores on tablets and computers: every game's leaderboard. On a computer it sits beside
 * the play area (see `Staged`), level with it. Change it here and every game changes.
 */
export function PlayBoard({
  rows,
  playerId,
  title,
  label = "Live scores",
  medals = false,
  always = false,
}: {
  rows: Face[];
  playerId: string;
  /** "3 players" by default. */
  title?: ReactNode;
  label?: string;
  /** Gold, silver and bronze for the top three, and a crown for first. */
  medals?: boolean;
  /** Shown on phones too, where a screen has room for it (between rounds). */
  always?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <aside className={`panel live-board${always ? " always" : ""}`} aria-label={label}>
      <h2 className="live-title">
        {title ?? `${rows.length} ${rows.length === 1 ? "player" : "players"}`}
      </h2>
      <ol>
        {rows.map((r) => {
          const mine = r.playerId === playerId;
          // No medal for someone who left, or who has nothing to show for it.
          const medal = medals && r.rank <= 3 && !r.gone;
          const name = (
            <span className="name">
              {mine ? "You" : r.nickname}
              {r.tag && <span className="tag">{r.tag}</span>}
            </span>
          );
          return (
            <li key={r.playerId} className={`${mine ? "me" : ""}${r.gone ? " gone" : ""}`}>
              <span className={`rank${medal ? ` medal m${r.rank}` : ""}`}>
                {medal && r.rank === 1 ? <Icon name="crown" size={15} stroke={2.6} /> : r.rank}
              </span>
              <span className="board-avatar">
                <Avatar id={r.avatar} name={r.nickname} size={40} />
              </span>
              {r.bar !== undefined ? (
                <span className="who">
                  {name}
                  <span className="bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(1, r.bar)) * 100}%` }} />
                  </span>
                </span>
              ) : (
                name
              )}
              <span className="pts">{r.value}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/**
 * The play area with the scores beside it on a computer, their tops and bottoms level. On a
 * phone the scores are left out (the faces show instead); on a tablet they go underneath.
 */
export function Staged({
  aside,
  wide = false,
  children,
}: {
  aside?: ReactNode;
  /** A jigsaw's board, wider than a grid. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`play-stage ${wide ? "fit-board" : "fit"}`}>
      <div className="play-area">{children}</div>
      {aside}
    </div>
  );
}

/** A game's own two colours, from its card in the catalogue, for its play screen. */
function gameColors(game: string | undefined): CSSProperties | undefined {
  if (!game) return undefined;
  const entry = CATALOG.find((g) => g.id === game || g.starts === game);
  if (!entry) return undefined;
  return { "--game-c1": entry.colors[0], "--game-c2": entry.colors[1] } as CSSProperties;
}

/**
 * Every game screen's frame: the top line, the screen, and the slim notice line at the bottom.
 * Given its `game`, the screen wears that game's colours: a glow at the top, and its timer bar.
 */
export function PlayFrame({
  label,
  latency,
  onQuit,
  game,
  children,
}: {
  label: ReactNode;
  latency: ReactNode;
  onQuit: () => void;
  game?: string;
  children: ReactNode;
}) {
  const colors = gameColors(game);
  return (
    <div className={`game play${colors ? " tinted" : ""}`} style={colors}>
      <PlayTop label={label} latency={latency} onQuit={onQuit} />
      {children}
      <PlayToast />
    </div>
  );
}

/**
 * A game screen: one column (timer, what to do, the play area, faces, the game's buttons). The
 * scores go beside the play area (`Staged`); a screen with no play area to stand them beside
 * passes them as `side` instead.
 */
export function PlayScreen({
  label,
  latency,
  onQuit,
  side,
  game,
  thumb = false,
  className = "",
  children,
}: {
  label: ReactNode;
  latency: ReactNode;
  onQuit: () => void;
  side?: ReactNode;
  /** The game, for its colours (see PlayFrame). */
  game?: string;
  /**
   * On phones, the question floats in the free space and the answers sit at the bottom as big
   * buttons, where the thumb is.
   */
  thumb?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PlayFrame label={label} latency={latency} onQuit={onQuit} game={game}>
      <div className={`game-layout${side ? "" : " staged"}`}>
        <div
          className={`game-main play-main play-column${thumb ? " thumb" : ""} ${className}`.trim()}
        >
          {children}
        </div>
        {side}
      </div>
    </PlayFrame>
  );
}
